import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { LichessPlayer } from "../chess/lichess/client.js";
import { getHighestRating } from "../chess/rating-selection.js";
import {
  getLichessRefreshRetryAt,
  LICHESS_MANUAL_REFRESH_COOLDOWN_MS,
  LICHESS_REFRESH_LEASE_MS
} from "../chess/lichess/rating-refresh-policy.js";
import { getFirestoreDb } from "./admin.js";
import { listDueRatingRefreshAccountIds } from "./rating-refresh-queries.js";
import {
  parseChzzkChessBadgeState,
  selectPreferredChessProvider
} from "./chess-badges.js";

const SUPPORTED_SPEEDS = ["bullet", "blitz", "rapid", "classical"] as const;

export type LichessRatingRefreshErrorCode =
  | "account_missing"
  | "cooldown"
  | "in_progress"
  | "identity_changed";

export class LichessRatingRefreshError extends Error {
  constructor(
    public readonly code: LichessRatingRefreshErrorCode,
    public readonly retryAt: Date | null = null
  ) {
    super(code);
    this.name = "LichessRatingRefreshError";
  }
}

export interface LichessRatingRefreshClaim {
  accountId: string;
  uid: string;
  chzzkChannelId: string;
  username: string;
  playerId: string;
  leaseId: string;
}

export async function listDueLichessRatingRefreshes(
  now: Date,
  limit = 20
): Promise<string[]> {
  return listDueRatingRefreshAccountIds("lichess", now, limit);
}

export async function claimManualLichessRatingRefresh(
  uid: string,
  now: Date
): Promise<LichessRatingRefreshClaim> {
  const db = getFirestoreDb();
  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async (transaction) => {
    const user = await transaction.get(userRef);
    const accountId = user.data()?.chessAccountIds?.lichess;
    if (typeof accountId !== "string") {
      throw new LichessRatingRefreshError("account_missing");
    }
    const account = await transaction.get(db.collection("chessAccounts").doc(accountId));
    return claimRefresh(transaction, account, uid, now, true);
  });
}

export async function claimScheduledLichessRatingRefresh(
  accountId: string,
  now: Date
): Promise<LichessRatingRefreshClaim | null> {
  const ref = getFirestoreDb().collection("chessAccounts").doc(accountId);
  return getFirestoreDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const next = snapshot.data()?.nextRatingRefreshAt;
    if (next instanceof Timestamp && next.toMillis() > now.getTime()) {
      return null;
    }
    try {
      return claimRefresh(transaction, snapshot, null, now, false);
    } catch (error) {
      if (error instanceof LichessRatingRefreshError) {
        return null;
      }
      throw error;
    }
  });
}

export async function completeLichessRatingRefresh(
  claim: LichessRatingRefreshClaim,
  player: LichessPlayer,
  now: Date,
  nextRefreshAt: Date
): Promise<boolean> {
  const db = getFirestoreDb();
  const accountRef = db.collection("chessAccounts").doc(claim.accountId);
  const chzzkRef = db.collection("chzzkAccounts").doc(claim.chzzkChannelId);

  return db.runTransaction(async (transaction) => {
    const [accountSnapshot, chzzkSnapshot] = await Promise.all([
      transaction.get(accountRef),
      transaction.get(chzzkRef)
    ]);
    const account = accountSnapshot.data();
    if (
      !account ||
      account.uid !== claim.uid ||
      account.ratingRefreshLeaseId !== claim.leaseId
    ) {
      return false;
    }
    if (String(account.providerUserId).toLowerCase() !== player.playerId.toLowerCase()) {
      throw new LichessRatingRefreshError("identity_changed");
    }

    const highest = getHighestRating(player.ratings);
    const ratings = new Map(player.ratings.map((rating) => [rating.speed, rating]));
    for (const speed of SUPPORTED_SPEEDS) {
      const ref = accountRef.collection("ratings").doc(speed);
      const rating = ratings.get(speed);
      if (rating) {
        transaction.set(ref, {
          speed,
          value: rating.value,
          ratingDeviation: rating.ratingDeviation,
          provisional: rating.provisional,
          games: rating.games,
          fetchedAt: Timestamp.fromDate(now)
        });
      } else {
        transaction.delete(ref);
      }
    }

    transaction.update(accountRef, {
      username: player.username,
      normalizedUsername: player.normalizedUsername,
      profileUrl: player.profileUrl,
      accountStatus: player.status,
      selectedSpeed: highest?.speed ?? null,
      ratingsFetchedAt: Timestamp.fromDate(now),
      nextRatingRefreshAt: Timestamp.fromDate(nextRefreshAt),
      ratingRefreshStatus: "idle",
      ratingRefreshFailureCount: 0,
      lastRatingRefreshError: FieldValue.delete(),
      ratingRefreshLeaseId: FieldValue.delete(),
      ratingRefreshLeaseUntil: FieldValue.delete(),
      updatedAt: Timestamp.fromDate(now)
    });

    if (chzzkSnapshot.data()?.uid === claim.uid) {
      const badge = highest
        ? {
            provider: "lichess" as const,
            speed: highest.speed,
            value: highest.value,
            provisional: highest.provisional
          }
        : null;
      const currentState = parseChzzkChessBadgeState(chzzkSnapshot.data());
      const badges = { ...currentState.badges };
      if (badge) {
        badges.lichess = badge;
      } else {
        delete badges.lichess;
      }
      const preferredProvider = selectPreferredChessProvider(
        badges,
        currentState.preferredProvider
      );
      transaction.set(chzzkRef, {
        badges,
        preferredChessProvider: preferredProvider ?? FieldValue.delete(),
        badge: FieldValue.delete(),
        updatedAt: Timestamp.fromDate(now)
      }, { merge: true });
    }
    return true;
  });
}

export async function failLichessRatingRefresh(
  claim: LichessRatingRefreshClaim,
  error: unknown,
  now: Date
): Promise<void> {
  const ref = getFirestoreDb().collection("chessAccounts").doc(claim.accountId);
  await getFirestoreDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (data?.ratingRefreshLeaseId !== claim.leaseId) {
      return;
    }
    const failures = typeof data.ratingRefreshFailureCount === "number"
      ? data.ratingRefreshFailureCount + 1
      : 1;
    const identityChanged =
      error instanceof LichessRatingRefreshError && error.code === "identity_changed";
    transaction.update(ref, {
      ratingRefreshStatus: "failed",
      ratingRefreshFailureCount: failures,
      lastRatingRefreshError: describeError(error),
      nextRatingRefreshAt: identityChanged
        ? FieldValue.delete()
        : Timestamp.fromDate(getLichessRefreshRetryAt(now, failures)),
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
): LichessRatingRefreshClaim {
  const account = snapshot.data();
  if (
    !account ||
    account.provider !== "lichess" ||
    typeof account.uid !== "string" ||
    (expectedUid && account.uid !== expectedUid)
  ) {
    throw new LichessRatingRefreshError("account_missing");
  }
  const cooldown = account.manualRefreshAvailableAt;
  if (enforceCooldown && cooldown instanceof Timestamp && cooldown.toMillis() > now.getTime()) {
    throw new LichessRatingRefreshError("cooldown", cooldown.toDate());
  }
  const leaseUntil = account.ratingRefreshLeaseUntil;
  if (leaseUntil instanceof Timestamp && leaseUntil.toMillis() > now.getTime()) {
    throw new LichessRatingRefreshError("in_progress", leaseUntil.toDate());
  }
  const channelId = account.uid.startsWith("chzzk:") ? account.uid.slice(6) : null;
  if (!channelId || typeof account.username !== "string" || typeof account.providerUserId !== "string") {
    throw new LichessRatingRefreshError("account_missing");
  }

  const leaseId = randomUUID();
  transaction.update(snapshot.ref, {
    ratingRefreshStatus: "refreshing",
    ratingRefreshLeaseId: leaseId,
    ratingRefreshLeaseUntil: Timestamp.fromMillis(now.getTime() + LICHESS_REFRESH_LEASE_MS),
    lastRatingRefreshAttemptAt: Timestamp.fromDate(now),
    manualRefreshAvailableAt: Timestamp.fromMillis(now.getTime() + LICHESS_MANUAL_REFRESH_COOLDOWN_MS),
    updatedAt: Timestamp.fromDate(now)
  });
  return {
    accountId: snapshot.id,
    uid: account.uid,
    chzzkChannelId: channelId,
    username: account.username,
    playerId: account.providerUserId,
    leaseId
  };
}

function describeError(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown refresh error").slice(0, 300);
}
