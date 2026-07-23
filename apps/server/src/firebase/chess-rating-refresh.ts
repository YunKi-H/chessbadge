import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { ChessComPlayer } from "../chess/chesscom/client.js";
import { getHighestChessComRating } from "../chess/rating-selection.js";
import {
  CHESS_COM_MANUAL_REFRESH_COOLDOWN_MS,
  CHESS_COM_REFRESH_LEASE_MS,
  getChessComRefreshRetryAt
} from "../chess/chesscom/rating-refresh-policy.js";
import { getFirestoreDb } from "./admin.js";
import { listDueRatingRefreshAccountIds } from "./rating-refresh-queries.js";
import {
  parseChzzkChessBadgeState,
  selectPreferredChessProvider
} from "./chess-badges.js";

const SUPPORTED_SPEEDS = ["bullet", "blitz", "rapid"] as const;

export type ChessRatingRefreshErrorCode =
  | "account_missing"
  | "not_verified"
  | "cooldown"
  | "in_progress"
  | "identity_changed";

export class ChessRatingRefreshError extends Error {
  constructor(
    public readonly code: ChessRatingRefreshErrorCode,
    public readonly retryAt: Date | null = null
  ) {
    super(code);
    this.name = "ChessRatingRefreshError";
  }
}

export interface ChessComRatingRefreshClaim {
  accountId: string;
  uid: string;
  chzzkChannelId: string;
  username: string;
  playerId: string;
  leaseId: string;
}

export async function listDueChessComRatingRefreshes(
  now: Date,
  limit = 20
): Promise<string[]> {
  return listDueRatingRefreshAccountIds("chesscom", now, limit);
}

export async function claimManualChessComRatingRefresh(
  uid: string,
  now: Date
): Promise<ChessComRatingRefreshClaim> {
  const db = getFirestoreDb();
  const userRef = db.collection("users").doc(uid);

  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const accountId = userSnapshot.data()?.chessAccountIds?.chesscom;

    if (typeof accountId !== "string") {
      throw new ChessRatingRefreshError("account_missing");
    }

    const accountRef = db.collection("chessAccounts").doc(accountId);
    const accountSnapshot = await transaction.get(accountRef);
    return claimRefresh(transaction, accountSnapshot, uid, now, true);
  });
}

export async function claimScheduledChessComRatingRefresh(
  accountId: string,
  now: Date
): Promise<ChessComRatingRefreshClaim | null> {
  const db = getFirestoreDb();
  const accountRef = db.collection("chessAccounts").doc(accountId);

  return db.runTransaction(async (transaction) => {
    const accountSnapshot = await transaction.get(accountRef);
    const account = accountSnapshot.data();

    if (
      account?.nextRatingRefreshAt instanceof Timestamp &&
      account.nextRatingRefreshAt.toMillis() > now.getTime()
    ) {
      return null;
    }

    try {
      return claimRefresh(transaction, accountSnapshot, null, now, false);
    } catch (error) {
      if (error instanceof ChessRatingRefreshError) {
        return null;
      }
      throw error;
    }
  });
}

export async function completeChessComRatingRefresh(
  claim: ChessComRatingRefreshClaim,
  player: ChessComPlayer,
  now: Date,
  nextRefreshAt: Date
): Promise<boolean> {
  const db = getFirestoreDb();
  const accountRef = db.collection("chessAccounts").doc(claim.accountId);
  const chzzkAccountRef = db
    .collection("chzzkAccounts")
    .doc(claim.chzzkChannelId);

  return db.runTransaction(async (transaction) => {
    const [accountSnapshot, chzzkAccountSnapshot] = await Promise.all([
      transaction.get(accountRef),
      transaction.get(chzzkAccountRef)
    ]);
    const account = accountSnapshot.data();

    if (
      !account ||
      account.uid !== claim.uid ||
      account.ratingRefreshLeaseId !== claim.leaseId
    ) {
      return false;
    }

    if (String(account.providerUserId) !== player.playerId) {
      throw new ChessRatingRefreshError("identity_changed");
    }

    const highestRating = getHighestChessComRating(player.ratings);
    const chessComBadge = highestRating
      ? {
          provider: "chesscom" as const,
          speed: highestRating.speed,
          value: highestRating.value,
          provisional: false
        }
      : null;
    const currentState = parseChzzkChessBadgeState(chzzkAccountSnapshot.data());
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
    const ratingsBySpeed = new Map(
      player.ratings.map((rating) => [rating.speed, rating] as const)
    );

    for (const speed of SUPPORTED_SPEEDS) {
      const ratingRef = accountRef.collection("ratings").doc(speed);
      const rating = ratingsBySpeed.get(speed);

      if (rating) {
        transaction.set(ratingRef, {
          speed,
          value: rating.value,
          ratingDeviation: rating.ratingDeviation,
          providerUpdatedAt: Timestamp.fromDate(rating.providerUpdatedAt),
          fetchedAt: Timestamp.fromDate(now)
        });
      } else {
        transaction.delete(ratingRef);
      }
    }

    transaction.update(accountRef, {
      username: player.username,
      normalizedUsername: player.normalizedUsername,
      profileUrl: player.profileUrl,
      avatarUrl: player.avatarUrl,
      accountStatus: player.status,
      selectedSpeed: highestRating?.speed ?? null,
      ratingsFetchedAt: Timestamp.fromDate(now),
      nextRatingRefreshAt: Timestamp.fromDate(nextRefreshAt),
      ratingRefreshStatus: "idle",
      ratingRefreshFailureCount: 0,
      lastRatingRefreshError: FieldValue.delete(),
      ratingRefreshLeaseId: FieldValue.delete(),
      ratingRefreshLeaseUntil: FieldValue.delete(),
      updatedAt: Timestamp.fromDate(now)
    });

    transaction.set(
      chzzkAccountRef,
      {
        badges,
        preferredChessProvider: preferredProvider ?? FieldValue.delete(),
        badge: FieldValue.delete(),
        updatedAt: Timestamp.fromDate(now)
      },
      { merge: true }
    );

    return true;
  });
}

export async function failChessComRatingRefresh(
  claim: ChessComRatingRefreshClaim,
  error: unknown,
  now: Date
): Promise<void> {
  const db = getFirestoreDb();
  const accountRef = db.collection("chessAccounts").doc(claim.accountId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(accountRef);
    const data = snapshot.data();

    if (data?.ratingRefreshLeaseId !== claim.leaseId) {
      return;
    }

    const failureCount =
      typeof data.ratingRefreshFailureCount === "number"
        ? data.ratingRefreshFailureCount + 1
        : 1;
    const permanentIdentityFailure =
      error instanceof ChessRatingRefreshError &&
      error.code === "identity_changed";

    transaction.update(accountRef, {
      ratingRefreshStatus: "failed",
      ratingRefreshFailureCount: failureCount,
      lastRatingRefreshError: describeError(error),
      nextRatingRefreshAt: permanentIdentityFailure
        ? FieldValue.delete()
        : Timestamp.fromDate(getChessComRefreshRetryAt(now, failureCount)),
      ratingRefreshLeaseId: FieldValue.delete(),
      ratingRefreshLeaseUntil: FieldValue.delete(),
      updatedAt: Timestamp.fromDate(now)
    });
  });
}

function claimRefresh(
  transaction: FirebaseFirestore.Transaction,
  snapshot: FirebaseFirestore.DocumentSnapshot,
  expectedUid: string | null,
  now: Date,
  enforceCooldown: boolean
): ChessComRatingRefreshClaim {
  const account = snapshot.data();

  if (
    !account ||
    account.provider !== "chesscom" ||
    typeof account.uid !== "string" ||
    (expectedUid !== null && account.uid !== expectedUid)
  ) {
    throw new ChessRatingRefreshError("account_missing");
  }

  if (!(account.verifiedAt instanceof Timestamp)) {
    throw new ChessRatingRefreshError("not_verified");
  }

  const cooldownUntil = account.manualRefreshAvailableAt;
  if (
    enforceCooldown &&
    cooldownUntil instanceof Timestamp &&
    cooldownUntil.toMillis() > now.getTime()
  ) {
    throw new ChessRatingRefreshError("cooldown", cooldownUntil.toDate());
  }

  const leaseUntil = account.ratingRefreshLeaseUntil;
  if (leaseUntil instanceof Timestamp && leaseUntil.toMillis() > now.getTime()) {
    throw new ChessRatingRefreshError("in_progress", leaseUntil.toDate());
  }

  const chzzkChannelId = account.uid.startsWith("chzzk:")
    ? account.uid.slice(6)
    : null;

  if (
    !chzzkChannelId ||
    typeof account.username !== "string" ||
    typeof account.providerUserId !== "string"
  ) {
    throw new ChessRatingRefreshError("account_missing");
  }

  const leaseId = randomUUID();
  transaction.update(snapshot.ref, {
    ratingRefreshStatus: "refreshing",
    ratingRefreshLeaseId: leaseId,
    ratingRefreshLeaseUntil: Timestamp.fromMillis(
      now.getTime() + CHESS_COM_REFRESH_LEASE_MS
    ),
    lastRatingRefreshAttemptAt: Timestamp.fromDate(now),
    manualRefreshAvailableAt: Timestamp.fromMillis(
      now.getTime() + CHESS_COM_MANUAL_REFRESH_COOLDOWN_MS
    ),
    updatedAt: Timestamp.fromDate(now)
  });

  return {
    accountId: snapshot.id,
    uid: account.uid,
    chzzkChannelId,
    username: account.username,
    playerId: account.providerUserId,
    leaseId
  };
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown refresh error";
  return message.slice(0, 300);
}
