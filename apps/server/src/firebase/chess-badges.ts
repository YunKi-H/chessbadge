import type { ChessSpeed, RatingBadge } from "@elobadge/core";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirestoreDb } from "./admin.js";
import { getHighestChessComRating } from "../chess/rating-selection.js";

export async function ensureHighestChessComBadge(
  uid: string,
  chzzkChannelId: string
): Promise<boolean> {
  const db = getFirestoreDb();
  const userRef = db.collection("users").doc(uid);

  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const accountId = userSnapshot.data()?.chessAccountIds?.chesscom;

    if (
      typeof accountId !== "string" ||
      userSnapshot.data()?.activeChessProvider === "lichess"
    ) {
      return false;
    }

    const accountRef = db.collection("chessAccounts").doc(accountId);
    const chzzkAccountRef = db.collection("chzzkAccounts").doc(chzzkChannelId);
    const ratingRefs = (["bullet", "blitz", "rapid"] as const).map((speed) =>
      accountRef.collection("ratings").doc(speed)
    );
    const snapshots = await Promise.all([
      transaction.get(accountRef),
      ...ratingRefs.map((ratingRef) => transaction.get(ratingRef)),
      transaction.get(chzzkAccountRef)
    ]);
    const accountSnapshot = snapshots[0];
    const ratingSnapshots = snapshots.slice(1, 4);
    const chzzkAccountSnapshot = snapshots[4];

    if (!chzzkAccountSnapshot) {
      return false;
    }

    const account = accountSnapshot.data();

    if (
      !account ||
      account.uid !== uid ||
      account.provider !== "chesscom" ||
      !(account.verifiedAt instanceof Timestamp) ||
      chzzkAccountSnapshot.data()?.uid !== uid
    ) {
      return false;
    }

    const highestRating = getHighestChessComRating(
      ratingSnapshots.flatMap((snapshot) => {
        const rating = snapshot.data();
        const speed = snapshot.id;

        return (
          (speed === "bullet" || speed === "blitz" || speed === "rapid") &&
          typeof rating?.value === "number"
        )
          ? [{ speed, value: rating.value }]
          : [];
      })
    );

    if (!highestRating) {
      return false;
    }

    const now = FieldValue.serverTimestamp();
    transaction.update(accountRef, {
      selectedSpeed: highestRating.speed,
      updatedAt: now
    });
    transaction.set(
      chzzkAccountRef,
      {
        badge: {
          provider: "chesscom",
          speed: highestRating.speed,
          value: highestRating.value,
          provisional: false
        },
        updatedAt: now
      },
      { merge: true }
    );
    return true;
  });
}

export async function getChzzkRatingBadge(
  chzzkChannelId: string
): Promise<RatingBadge | null> {
  const snapshot = await getFirestoreDb()
    .collection("chzzkAccounts")
    .doc(chzzkChannelId)
    .get();
  const badge = snapshot.data()?.badge;

  if (
    !badge ||
    (badge.provider !== "chesscom" && badge.provider !== "lichess") ||
    !isChessSpeed(badge.speed) ||
    typeof badge.value !== "number" ||
    typeof badge.provisional !== "boolean"
  ) {
    return null;
  }

  return {
    provider: badge.provider,
    speed: badge.speed,
    value: badge.value,
    provisional: badge.provisional
  };
}

function isChessSpeed(value: unknown): value is ChessSpeed {
  return (
    value === "bullet" ||
    value === "blitz" ||
    value === "rapid" ||
    value === "classical"
  );
}
