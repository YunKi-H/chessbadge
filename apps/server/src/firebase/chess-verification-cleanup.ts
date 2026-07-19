import { Timestamp } from "firebase-admin/firestore";
import { getFirestoreDb } from "./admin.js";

export const VERIFICATION_CLEANUP_BATCH_SIZE = 100;

export async function deleteExpiredChessVerificationChallenges(
  now: Date,
  limit = VERIFICATION_CLEANUP_BATCH_SIZE
): Promise<number> {
  const db = getFirestoreDb();
  const snapshot = await db
    .collection("chessVerificationChallenges")
    .where("expiresAt", "<=", Timestamp.fromDate(now))
    .orderBy("expiresAt", "asc")
    .limit(limit)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  const batch = db.batch();

  for (const document of snapshot.docs) {
    batch.delete(document.ref);
  }

  await batch.commit();
  return snapshot.size;
}
