import type { DocumentReference } from "firebase-admin/firestore";
import { getFirebaseAuth, getFirestoreDb } from "./admin.js";

const MAX_BATCH_DELETES = 400;
const CHESS_COM_RATING_SPEEDS = ["bullet", "blitz", "rapid"] as const;
const LICHESS_RATING_SPEEDS = ["bullet", "blitz", "rapid", "classical"] as const;

export interface DeletedUserData {
  overlayTokens: string[];
}

export async function deleteUserFirestoreData(
  uid: string,
  chzzkChannelId: string
): Promise<DeletedUserData> {
  assertChzzkIdentity(uid, chzzkChannelId);

  const db = getFirestoreDb();
  const userRef = db.collection("users").doc(uid);
  const [userSnapshot, overlaysSnapshot] = await Promise.all([
    userRef.get(),
    db.collection("overlays").where("streamerUid", "==", uid).get()
  ]);
  const chessAccountIds = userSnapshot.data()?.chessAccountIds;
  const dependentRefs: DocumentReference[] = overlaysSnapshot.docs.map(
    (document) => document.ref
  );

  const chessComAccountId = chessAccountIds?.chesscom;
  if (typeof chessComAccountId === "string") {
    const accountId = chessComAccountId;
    const accountRef = db.collection("chessAccounts").doc(accountId);
    const challengeRef = db
      .collection("chessVerificationChallenges")
      .doc(accountId);
    const [accountSnapshot, challengeSnapshot] = await Promise.all([
      accountRef.get(),
      challengeRef.get()
    ]);

    if (accountSnapshot.data()?.uid === uid) {
      dependentRefs.push(
        ...CHESS_COM_RATING_SPEEDS.map((speed) =>
          accountRef.collection("ratings").doc(speed)
        ),
        accountRef
      );
    }

    if (challengeSnapshot.data()?.uid === uid) {
      dependentRefs.push(challengeRef);
    }
  }

  const lichessAccountId = chessAccountIds?.lichess;
  if (typeof lichessAccountId === "string") {
    const accountRef = db.collection("chessAccounts").doc(lichessAccountId);
    const accountSnapshot = await accountRef.get();

    if (
      accountSnapshot.data()?.uid === uid &&
      accountSnapshot.data()?.provider === "lichess"
    ) {
      dependentRefs.push(
        ...LICHESS_RATING_SPEEDS.map((speed) =>
          accountRef.collection("ratings").doc(speed)
        ),
        accountRef
      );
    }
  }

  await deleteReferences(dependentRefs);

  const finalBatch = db.batch();
  finalBatch.delete(userRef);
  finalBatch.delete(db.collection("chzzkAccounts").doc(chzzkChannelId));
  finalBatch.delete(db.collection("streamers").doc(uid));
  finalBatch.delete(db.collection("chzzkTokens").doc(uid));
  await finalBatch.commit();

  return {
    overlayTokens: overlaysSnapshot.docs.map((document) => document.id)
  };
}

export async function deleteFirebaseAuthUser(uid: string): Promise<void> {
  try {
    await getFirebaseAuth().deleteUser(uid);
  } catch (error) {
    if (!hasFirebaseCode(error, "auth/user-not-found")) {
      throw error;
    }
  }
}

function assertChzzkIdentity(uid: string, chzzkChannelId: string): void {
  if (uid !== `chzzk:${chzzkChannelId}`) {
    throw new Error("Firebase user does not match the Chzzk identity");
  }
}

async function deleteReferences(references: DocumentReference[]): Promise<void> {
  const db = getFirestoreDb();

  for (let index = 0; index < references.length; index += MAX_BATCH_DELETES) {
    const batch = db.batch();

    for (const reference of references.slice(index, index + MAX_BATCH_DELETES)) {
      batch.delete(reference);
    }

    await batch.commit();
  }
}

function hasFirebaseCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === code
  );
}
