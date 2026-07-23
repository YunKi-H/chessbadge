import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { getFirestoreDb } from "./admin.js";
import { parseChzzkChessBadgeState } from "./chess-badges.js";

const CHESS_BADGE_SCHEMA_VERSION = 2;
const PAGE_SIZE = 300;

export interface ChessBadgeMigrationResult {
  chzzkAccountsFound: number;
  chzzkAccountsMigrated: number;
  usersFound: number;
  usersMigrated: number;
}

export async function migrateLegacyChessBadgeData(
  execute = false
): Promise<ChessBadgeMigrationResult> {
  const db = getFirestoreDb();
  const result: ChessBadgeMigrationResult = {
    chzzkAccountsFound: 0,
    chzzkAccountsMigrated: 0,
    usersFound: 0,
    usersMigrated: 0
  };

  let lastChzzkAccountId: string | null = null;
  while (true) {
    let query = db.collection("chzzkAccounts")
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (lastChzzkAccountId) {
      query = query.startAfter(lastChzzkAccountId);
    }
    const snapshot = await query.get();
    const batch = db.batch();
    let writes = 0;

    for (const document of snapshot.docs) {
      const data = document.data();
      if (!Object.hasOwn(data, "badge")) {
        continue;
      }

      result.chzzkAccountsFound += 1;
      if (execute) {
        const state = parseChzzkChessBadgeState(data);
        batch.update(document.ref, {
          badges: state.badges,
          preferredChessProvider:
            state.preferredProvider ?? FieldValue.delete(),
          badge: FieldValue.delete(),
          chessBadgeSchemaVersion: CHESS_BADGE_SCHEMA_VERSION,
          updatedAt: FieldValue.serverTimestamp()
        });
        writes += 1;
      }
    }

    if (writes > 0) {
      await batch.commit();
      result.chzzkAccountsMigrated += writes;
    }
    if (snapshot.size < PAGE_SIZE) {
      break;
    }
    lastChzzkAccountId = snapshot.docs.at(-1)?.id ?? null;
    if (!lastChzzkAccountId) {
      break;
    }
  }

  let lastUserId: string | null = null;
  while (true) {
    let query = db.collection("users")
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (lastUserId) {
      query = query.startAfter(lastUserId);
    }
    const snapshot = await query.get();
    const batch = db.batch();
    let writes = 0;

    for (const document of snapshot.docs) {
      const data = document.data();
      if (!Object.hasOwn(data, "activeChessProvider")) {
        continue;
      }

      result.usersFound += 1;
      if (execute) {
        batch.update(document.ref, {
          activeChessProvider: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp()
        });
        writes += 1;
      }
    }

    if (writes > 0) {
      await batch.commit();
      result.usersMigrated += writes;
    }
    if (snapshot.size < PAGE_SIZE) {
      break;
    }
    lastUserId = snapshot.docs.at(-1)?.id ?? null;
    if (!lastUserId) {
      break;
    }
  }

  return result;
}
