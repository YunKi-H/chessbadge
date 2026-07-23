import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { ChessComPlayer, ChessComRating } from "../chess/chesscom/client.js";
import { getFirestoreDb } from "./admin.js";
import { getHighestChessComRating } from "../chess/rating-selection.js";
import {
  CHESS_COM_MANUAL_REFRESH_COOLDOWN_MS,
  getNextChessComRefreshAt
} from "../chess/chesscom/rating-refresh-policy.js";
import {
  parseChzzkChessBadgeState,
  selectPreferredChessProvider
} from "./chess-badges.js";

export interface StoredChessComAccount {
  username: string;
  normalizedUsername: string;
  playerId: string;
  profileUrl: string;
  avatarUrl: string | null;
  status: string;
  verified: boolean;
  selectedSpeed: ChessComRating["speed"] | null;
  ratingsFetchedAt: Date | null;
  manualRefreshAvailableAt: Date | null;
  ratings: ChessComRating[];
}

export class ChessAccountConflictError extends Error {
  constructor() {
    super("This Chess.com account is already linked to another user");
    this.name = "ChessAccountConflictError";
  }
}

export async function disconnectChessComAccount(
  uid: string,
  chzzkChannelId: string
): Promise<boolean> {
  const db = getFirestoreDb();
  const userRef = db.collection("users").doc(uid);
  const chzzkAccountRef = db.collection("chzzkAccounts").doc(chzzkChannelId);

  return db.runTransaction(async (transaction) => {
    const [userSnapshot, chzzkAccountSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(chzzkAccountRef)
    ]);
    const accountId = userSnapshot.data()?.chessAccountIds?.chesscom;

    if (typeof accountId !== "string") {
      return true;
    }

    const accountRef = db.collection("chessAccounts").doc(accountId);
    const challengeRef = db.collection("chessVerificationChallenges").doc(accountId);
    const ratingRefs = (["bullet", "blitz", "rapid"] as const).map((speed) =>
      accountRef.collection("ratings").doc(speed)
    );
    const [accountSnapshot, challengeSnapshot] = await Promise.all([
      transaction.get(accountRef),
      transaction.get(challengeRef)
    ]);
    const account = accountSnapshot.data();

    if (
      !account ||
      account.uid !== uid ||
      account.provider !== "chesscom" ||
      chzzkAccountSnapshot.data()?.uid !== uid
    ) {
      return false;
    }

    const now = FieldValue.serverTimestamp();
    const currentState = parseChzzkChessBadgeState(chzzkAccountSnapshot.data());
    const remainingBadges = { ...currentState.badges };
    delete remainingBadges.chesscom;
    const preferredProvider = selectPreferredChessProvider(
      remainingBadges,
      currentState.preferredProvider
    );
    transaction.delete(accountRef);
    for (const ratingRef of ratingRefs) {
      transaction.delete(ratingRef);
    }
    transaction.update(userRef, {
      "chessAccountIds.chesscom": FieldValue.delete(),
      activeChessProvider: FieldValue.delete(),
      updatedAt: now
    });
    transaction.update(chzzkAccountRef, {
      badges: remainingBadges,
      preferredChessProvider: preferredProvider ?? FieldValue.delete(),
      badge: FieldValue.delete(),
      updatedAt: now
    });

    if (challengeSnapshot.exists) {
      transaction.delete(challengeRef);
    }

    return true;
  });
}

export async function saveUnverifiedChessComAccount(
  uid: string,
  player: ChessComPlayer
): Promise<StoredChessComAccount> {
  const db = getFirestoreDb();
  const accountId = toChessComAccountId(player.normalizedUsername);
  const accountRef = db.collection("chessAccounts").doc(accountId);
  const userRef = db.collection("users").doc(uid);
  const chzzkChannelId = uid.startsWith("chzzk:") ? uid.slice(6) : null;
  const chzzkAccountRef = chzzkChannelId
    ? db.collection("chzzkAccounts").doc(chzzkChannelId)
    : null;
  const fetchedAt = new Date();
  const manualRefreshAvailableAt = new Date(
    fetchedAt.getTime() + CHESS_COM_MANUAL_REFRESH_COOLDOWN_MS
  );

  const savedState = await db.runTransaction(async (transaction) => {
    const [accountSnapshot, userSnapshot, chzzkAccountSnapshot] = await Promise.all([
      transaction.get(accountRef),
      transaction.get(userRef),
      chzzkAccountRef ? transaction.get(chzzkAccountRef) : Promise.resolve(null)
    ]);
    const linkedUid = accountSnapshot.data()?.uid;

    if (linkedUid && linkedUid !== uid) {
      throw new ChessAccountConflictError();
    }

    const previousAccountId = userSnapshot.data()?.chessAccountIds?.chesscom;
    const preserveVerification = accountSnapshot.exists && linkedUid === uid;
    const existingAccount = accountSnapshot.data();
    const verified =
      preserveVerification && existingAccount?.verifiedAt instanceof Timestamp;
    const selectedRating = verified
      ? getHighestChessComRating(player.ratings) ?? undefined
      : undefined;
    const selectedSpeed = selectedRating?.speed ?? null;
    const now = FieldValue.serverTimestamp();

    if (typeof previousAccountId === "string" && previousAccountId !== accountId) {
      const previousAccountRef = db.collection("chessAccounts").doc(previousAccountId);
      const previousSnapshot = await transaction.get(previousAccountRef);

      if (previousSnapshot.data()?.uid === uid) {
        transaction.update(previousAccountRef, {
          uid: null,
          disconnectedAt: now,
          updatedAt: now
        });
      }
    }

    transaction.set(
      accountRef,
      {
        uid,
        provider: "chesscom",
        username: player.username,
        normalizedUsername: player.normalizedUsername,
        providerUserId: player.playerId,
        profileUrl: player.profileUrl,
        avatarUrl: player.avatarUrl,
        accountStatus: player.status,
        selectedSpeed,
        ...(preserveVerification
          ? {}
          : {
              verifiedAt: null,
              verificationMethod: null
            }),
        disconnectedAt: null,
        ...(accountSnapshot.exists ? {} : { createdAt: now }),
        updatedAt: now,
        ratingsFetchedAt: Timestamp.fromDate(fetchedAt),
        manualRefreshAvailableAt: Timestamp.fromDate(manualRefreshAvailableAt),
        nextRatingRefreshAt: verified
          ? Timestamp.fromDate(getNextChessComRefreshAt(fetchedAt))
          : FieldValue.delete(),
        ratingRefreshStatus: "idle",
        ratingRefreshFailureCount: 0,
        lastRatingRefreshError: FieldValue.delete(),
        ratingRefreshLeaseId: FieldValue.delete(),
        ratingRefreshLeaseUntil: FieldValue.delete()
      },
      { merge: true }
    );
    transaction.set(
      userRef,
      {
        chessAccountIds: { chesscom: accountId },
        activeChessProvider: FieldValue.delete(),
        updatedAt: now
      },
      { merge: true }
    );
    if (chzzkAccountRef) {
      const chessComBadge = selectedRating
        ? {
            provider: "chesscom" as const,
            speed: selectedRating.speed,
            value: selectedRating.value,
            provisional: false
          }
        : null;
      const currentState = parseChzzkChessBadgeState(
        chzzkAccountSnapshot?.data()
      );
      const badges = { ...currentState.badges };
      if (chessComBadge) {
        badges.chesscom = chessComBadge;
      } else {
        delete badges.chesscom;
      }
      const preferredProvider = selectPreferredChessProvider(
        badges,
        currentState.preferredProvider
      );
      transaction.set(
        chzzkAccountRef,
        {
          badges,
          preferredChessProvider:
            preferredProvider ?? FieldValue.delete(),
          badge: FieldValue.delete(),
          updatedAt: now
        },
        { merge: true }
      );
    }
    return {
      verified,
      selectedSpeed
    };
  });

  const batch = db.batch();

  for (const rating of player.ratings) {
    batch.set(
      accountRef.collection("ratings").doc(rating.speed),
      {
        speed: rating.speed,
        value: rating.value,
        ratingDeviation: rating.ratingDeviation,
        providerUpdatedAt: Timestamp.fromDate(rating.providerUpdatedAt),
        fetchedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  await batch.commit();
  return {
    ...player,
    verified: savedState.verified,
    selectedSpeed: savedState.selectedSpeed,
    ratingsFetchedAt: fetchedAt,
    manualRefreshAvailableAt
  };
}

export async function getUserChessComAccount(
  uid: string
): Promise<StoredChessComAccount | null> {
  const db = getFirestoreDb();
  const userSnapshot = await db.collection("users").doc(uid).get();
  const accountId = userSnapshot.data()?.chessAccountIds?.chesscom;

  if (typeof accountId !== "string") {
    return null;
  }

  const accountRef = db.collection("chessAccounts").doc(accountId);
  const [accountSnapshot, ratingsSnapshot] = await Promise.all([
    accountRef.get(),
    accountRef.collection("ratings").get()
  ]);
  const data = accountSnapshot.data();

  if (!data || data.uid !== uid || data.provider !== "chesscom") {
    return null;
  }

  const ratings = ratingsSnapshot.docs.flatMap((document) => {
    const rating = document.data();
    const providerUpdatedAt = rating.providerUpdatedAt;

    if (
      !isChessComSpeed(rating.speed) ||
      typeof rating.value !== "number" ||
      typeof rating.ratingDeviation !== "number" ||
      !(providerUpdatedAt instanceof Timestamp)
    ) {
      return [];
    }

    return [{
      speed: rating.speed,
      value: rating.value,
      ratingDeviation: rating.ratingDeviation,
      providerUpdatedAt: providerUpdatedAt.toDate()
    }];
  });

  return {
    username: String(data.username),
    normalizedUsername: String(data.normalizedUsername),
    playerId: String(data.providerUserId),
    profileUrl: String(data.profileUrl),
    avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : null,
    status: String(data.accountStatus),
    verified: data.verifiedAt instanceof Timestamp,
    selectedSpeed: isChessComSpeed(data.selectedSpeed) ? data.selectedSpeed : null,
    ratingsFetchedAt:
      data.ratingsFetchedAt instanceof Timestamp
        ? data.ratingsFetchedAt.toDate()
        : null,
    manualRefreshAvailableAt:
      data.manualRefreshAvailableAt instanceof Timestamp
        ? data.manualRefreshAvailableAt.toDate()
        : null,
    ratings
  };
}

function toChessComAccountId(normalizedUsername: string): string {
  return `chesscom:${normalizedUsername}`;
}

function isChessComSpeed(value: unknown): value is ChessComRating["speed"] {
  return value === "bullet" || value === "blitz" || value === "rapid";
}
