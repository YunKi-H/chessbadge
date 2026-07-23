import { isDeepStrictEqual } from "node:util";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { getFirestoreDb } from "./admin.js";
import { normalizeOverlayAppearance } from "./overlays.js";

const PAGE_SIZE = 300;

export interface OverlayAppearanceMigrationResult {
  found: number;
  migrated: number;
}

export async function backfillOverlayAppearances(
  execute = false
): Promise<OverlayAppearanceMigrationResult> {
  const db = getFirestoreDb();
  const result: OverlayAppearanceMigrationResult = { found: 0, migrated: 0 };
  let lastOverlayId: string | null = null;

  while (true) {
    let query = db.collection("overlays")
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (lastOverlayId) {
      query = query.startAfter(lastOverlayId);
    }

    const snapshot = await query.get();
    for (const document of snapshot.docs) {
      if (!needsAppearanceBackfill(document.data())) {
        continue;
      }
      result.found += 1;

      if (!execute) {
        continue;
      }

      const migrated = await db.runTransaction(async (transaction) => {
        const current = await transaction.get(document.ref);
        const data = current.data();
        if (!needsAppearanceBackfill(data)) {
          return false;
        }
        transaction.update(document.ref, {
          theme: normalizeOverlayAppearance(data?.theme),
          updatedAt: FieldValue.serverTimestamp()
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
    lastOverlayId = snapshot.docs.at(-1)?.id ?? null;
    if (!lastOverlayId) {
      break;
    }
  }

  return result;
}

function needsAppearanceBackfill(
  data: FirebaseFirestore.DocumentData | undefined
): boolean {
  if (
    typeof data?.streamerUid !== "string" ||
    typeof data.active !== "boolean"
  ) {
    return false;
  }
  return !isDeepStrictEqual(data.theme, normalizeOverlayAppearance(data.theme));
}
