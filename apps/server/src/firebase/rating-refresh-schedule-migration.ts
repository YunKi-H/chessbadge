import { createHash } from "node:crypto";
import type { ChessProvider } from "@elobadge/core";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { getFirestoreDb } from "./admin.js";

const PAGE_SIZE = 300;
const BACKFILL_WINDOW_MS = 12 * 60 * 60 * 1_000;

export interface RatingRefreshScheduleMigrationResult {
  chesscomFound: number;
  lichessFound: number;
  migrated: number;
}

export async function backfillMissingRatingRefreshSchedules(
  execute = false,
  now = new Date()
): Promise<RatingRefreshScheduleMigrationResult> {
  const db = getFirestoreDb();
  const result: RatingRefreshScheduleMigrationResult = {
    chesscomFound: 0,
    lichessFound: 0,
    migrated: 0
  };
  let lastAccountId: string | null = null;

  while (true) {
    let query = db.collection("chessAccounts")
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (lastAccountId) {
      query = query.startAfter(lastAccountId);
    }

    const snapshot = await query.get();
    for (const document of snapshot.docs) {
      const provider = getMissingScheduleProvider(document.data());
      if (!provider) {
        continue;
      }

      result[provider === "chesscom" ? "chesscomFound" : "lichessFound"] += 1;
      if (!execute) {
        continue;
      }

      const migrated = await db.runTransaction(async (transaction) => {
        const current = await transaction.get(document.ref);
        if (!getMissingScheduleProvider(current.data())) {
          return false;
        }
        transaction.update(document.ref, {
          nextRatingRefreshAt: Timestamp.fromDate(
            getDistributedRefreshAt(document.id, now)
          ),
          updatedAt: Timestamp.fromDate(now)
        });
        return true;
      });
      if (migrated) {
        result.migrated += 1;
      }
    }

    if (snapshot.size < PAGE_SIZE) {
      break;
    }
    lastAccountId = snapshot.docs.at(-1)?.id ?? null;
    if (!lastAccountId) {
      break;
    }
  }

  return result;
}

function getMissingScheduleProvider(
  data: FirebaseFirestore.DocumentData | undefined
): ChessProvider | null {
  if (
    (data?.provider !== "chesscom" && data?.provider !== "lichess") ||
    typeof data.uid !== "string" ||
    !(data.verifiedAt instanceof Timestamp) ||
    data.nextRatingRefreshAt instanceof Timestamp
  ) {
    return null;
  }
  return data.provider;
}

function getDistributedRefreshAt(accountId: string, now: Date): Date {
  const hash = createHash("sha256").update(accountId).digest().readUInt32BE(0);
  const offset = Math.floor((hash / 0x1_0000_0000) * BACKFILL_WINDOW_MS);
  return new Date(now.getTime() + offset);
}
