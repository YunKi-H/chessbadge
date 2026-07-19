import type { DocumentReference } from "firebase-admin/firestore";
import { getFirestoreDb } from "./admin.js";

const MAX_BATCH_DELETES = 400;

export interface OverlayCleanupResult {
  scanned: number;
  deleted: number;
}

export async function deleteOrphanedInactiveOverlays(): Promise<OverlayCleanupResult> {
  const db = getFirestoreDb();
  const overlays = await db
    .collection("overlays")
    .where("active", "==", false)
    .get();

  if (overlays.empty) {
    return { scanned: 0, deleted: 0 };
  }

  const streamerRefs = new Map<string, DocumentReference>();

  for (const overlay of overlays.docs) {
    const streamerUid = overlay.data().streamerUid;

    if (typeof streamerUid === "string") {
      streamerRefs.set(
        streamerUid,
        db.collection("streamers").doc(streamerUid)
      );
    }
  }

  const streamerSnapshots = streamerRefs.size > 0
    ? await db.getAll(...streamerRefs.values())
    : [];
  const currentTokens = new Map(
    streamerSnapshots.map((streamer) => [
      streamer.id,
      streamer.data()?.overlayToken
    ])
  );
  const orphaned = overlays.docs.filter((overlay) => {
    const streamerUid = overlay.data().streamerUid;
    return (
      typeof streamerUid !== "string" ||
      currentTokens.get(streamerUid) !== overlay.id
    );
  });

  for (let index = 0; index < orphaned.length; index += MAX_BATCH_DELETES) {
    const batch = db.batch();

    for (const overlay of orphaned.slice(index, index + MAX_BATCH_DELETES)) {
      batch.delete(overlay.ref);
    }

    await batch.commit();
  }

  return { scanned: overlays.size, deleted: orphaned.length };
}
