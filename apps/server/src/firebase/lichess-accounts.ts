import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { LichessPlayer, LichessRating } from "../chess/lichess/client.js";
import { getHighestRating } from "../chess/rating-selection.js";
import { getFirestoreDb } from "./admin.js";

const SUPPORTED_SPEEDS = ["bullet", "blitz", "rapid", "classical"] as const;
const MANUAL_REFRESH_COOLDOWN_MS = 5 * 60 * 1_000;

export interface StoredLichessAccount extends LichessPlayer {
  verified: true;
  selectedSpeed: LichessRating["speed"] | null;
  ratingsFetchedAt: Date | null;
  manualRefreshAvailableAt: Date | null;
}

export class LichessAccountConflictError extends Error {
  constructor() {
    super("This Lichess account is already linked to another user");
    this.name = "LichessAccountConflictError";
  }
}

export type LichessRefreshErrorCode = "account_missing" | "cooldown" | "identity_changed";

export class LichessRefreshError extends Error {
  constructor(
    public readonly code: LichessRefreshErrorCode,
    public readonly retryAt: Date | null = null
  ) {
    super(code);
    this.name = "LichessRefreshError";
  }
}

export async function saveVerifiedLichessAccount(
  uid: string,
  chzzkChannelId: string,
  player: LichessPlayer,
  activateProvider = true
): Promise<StoredLichessAccount> {
  const db = getFirestoreDb();
  const accountId = toLichessAccountId(player.normalizedUsername);
  const accountRef = db.collection("chessAccounts").doc(accountId);
  const userRef = db.collection("users").doc(uid);
  const chzzkAccountRef = db.collection("chzzkAccounts").doc(chzzkChannelId);
  const fetchedAt = new Date();
  const refreshAvailableAt = new Date(fetchedAt.getTime() + MANUAL_REFRESH_COOLDOWN_MS);
  const highest = getHighestRating(player.ratings);

  await db.runTransaction(async (transaction) => {
    const [accountSnapshot, userSnapshot, chzzkAccountSnapshot] = await Promise.all([
      transaction.get(accountRef),
      transaction.get(userRef),
      transaction.get(chzzkAccountRef)
    ]);
    const linkedUid = accountSnapshot.data()?.uid;

    if (linkedUid && linkedUid !== uid) {
      throw new LichessAccountConflictError();
    }
    if (chzzkAccountSnapshot.data()?.uid !== uid) {
      throw new Error("Chzzk account does not match the authenticated user");
    }

    const previousAccountId = userSnapshot.data()?.chessAccountIds?.lichess;
    const shouldActivate =
      activateProvider || userSnapshot.data()?.activeChessProvider !== "chesscom";
    const now = FieldValue.serverTimestamp();

    if (typeof previousAccountId === "string" && previousAccountId !== accountId) {
      const previousRef = db.collection("chessAccounts").doc(previousAccountId);
      const previousSnapshot = await transaction.get(previousRef);
      if (previousSnapshot.data()?.uid === uid) {
        transaction.update(previousRef, { uid: null, disconnectedAt: now, updatedAt: now });
      }
    }

    transaction.set(accountRef, {
      uid,
      provider: "lichess",
      username: player.username,
      normalizedUsername: player.normalizedUsername,
      providerUserId: player.playerId,
      profileUrl: player.profileUrl,
      avatarUrl: null,
      accountStatus: player.status,
      verifiedAt: now,
      verificationMethod: "oauth_pkce",
      selectedSpeed: highest?.speed ?? null,
      ratingsFetchedAt: Timestamp.fromDate(fetchedAt),
      manualRefreshAvailableAt: Timestamp.fromDate(refreshAvailableAt),
      disconnectedAt: null,
      ...(accountSnapshot.exists ? {} : { createdAt: now }),
      updatedAt: now
    }, { merge: true });
    transaction.set(userRef, {
      chessAccountIds: { lichess: accountId },
      ...(shouldActivate ? { activeChessProvider: "lichess" } : {}),
      updatedAt: now
    }, { merge: true });
    if (shouldActivate) {
      transaction.set(chzzkAccountRef, {
        badge: highest ? toBadge(highest) : null,
        updatedAt: now
      }, { merge: true });
    }

    const ratingsBySpeed = new Map(player.ratings.map((rating) => [rating.speed, rating]));
    for (const speed of SUPPORTED_SPEEDS) {
      const ratingRef = accountRef.collection("ratings").doc(speed);
      const rating = ratingsBySpeed.get(speed);
      if (rating) {
        transaction.set(ratingRef, toStoredRating(rating, fetchedAt));
      } else {
        transaction.delete(ratingRef);
      }
    }
  });

  return {
    ...player,
    verified: true,
    selectedSpeed: highest?.speed ?? null,
    ratingsFetchedAt: fetchedAt,
    manualRefreshAvailableAt: refreshAvailableAt
  };
}

export async function getUserLichessAccount(uid: string): Promise<StoredLichessAccount | null> {
  const db = getFirestoreDb();
  const userSnapshot = await db.collection("users").doc(uid).get();
  const accountId = userSnapshot.data()?.chessAccountIds?.lichess;

  if (typeof accountId !== "string") {
    return null;
  }

  const accountRef = db.collection("chessAccounts").doc(accountId);
  const [accountSnapshot, ratingsSnapshot] = await Promise.all([
    accountRef.get(),
    accountRef.collection("ratings").get()
  ]);
  const data = accountSnapshot.data();

  if (!data || data.uid !== uid || data.provider !== "lichess") {
    return null;
  }

  const ratings = ratingsSnapshot.docs.flatMap((document) => {
    const rating = document.data();
    if (
      !isLichessSpeed(rating.speed) ||
      typeof rating.value !== "number" ||
      typeof rating.ratingDeviation !== "number" ||
      typeof rating.provisional !== "boolean" ||
      typeof rating.games !== "number"
    ) {
      return [];
    }
    return [{
      speed: rating.speed,
      value: rating.value,
      ratingDeviation: rating.ratingDeviation,
      provisional: rating.provisional,
      games: rating.games
    }];
  });

  return {
    username: String(data.username),
    normalizedUsername: String(data.normalizedUsername),
    playerId: String(data.providerUserId),
    profileUrl: String(data.profileUrl),
    avatarUrl: null,
    status: data.accountStatus === "disabled" ? "disabled" : "active",
    verified: true,
    selectedSpeed: isLichessSpeed(data.selectedSpeed) ? data.selectedSpeed : null,
    ratingsFetchedAt: data.ratingsFetchedAt instanceof Timestamp
      ? data.ratingsFetchedAt.toDate()
      : null,
    manualRefreshAvailableAt: data.manualRefreshAvailableAt instanceof Timestamp
      ? data.manualRefreshAvailableAt.toDate()
      : null,
    ratings
  };
}

export async function refreshLichessAccount(
  uid: string,
  chzzkChannelId: string,
  getPlayer: (username: string) => Promise<LichessPlayer>,
  now = new Date()
): Promise<StoredLichessAccount> {
  const current = await getUserLichessAccount(uid);
  if (!current) {
    throw new LichessRefreshError("account_missing");
  }
  if (
    current.manualRefreshAvailableAt &&
    current.manualRefreshAvailableAt.getTime() > now.getTime()
  ) {
    throw new LichessRefreshError("cooldown", current.manualRefreshAvailableAt);
  }

  const player = await getPlayer(current.username);
  if (player.playerId.toLowerCase() !== current.playerId.toLowerCase()) {
    throw new LichessRefreshError("identity_changed");
  }
  return saveVerifiedLichessAccount(uid, chzzkChannelId, player, false);
}

export async function disconnectLichessAccount(
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
    const accountId = userSnapshot.data()?.chessAccountIds?.lichess;
    if (typeof accountId !== "string") {
      return true;
    }

    const accountRef = db.collection("chessAccounts").doc(accountId);
    const accountSnapshot = await transaction.get(accountRef);
    if (
      accountSnapshot.data()?.uid !== uid ||
      accountSnapshot.data()?.provider !== "lichess" ||
      chzzkAccountSnapshot.data()?.uid !== uid
    ) {
      return false;
    }

    const chessComIsActive = userSnapshot.data()?.activeChessProvider === "chesscom";
    const now = FieldValue.serverTimestamp();
    for (const speed of SUPPORTED_SPEEDS) {
      transaction.delete(accountRef.collection("ratings").doc(speed));
    }
    transaction.delete(accountRef);
    transaction.update(userRef, {
      "chessAccountIds.lichess": FieldValue.delete(),
      ...(chessComIsActive ? {} : { activeChessProvider: FieldValue.delete() }),
      updatedAt: now
    });
    if (!chessComIsActive) {
      transaction.update(chzzkAccountRef, { badge: null, updatedAt: now });
    }
    return true;
  });
}

function toStoredRating(rating: LichessRating, fetchedAt: Date) {
  return {
    speed: rating.speed,
    value: rating.value,
    ratingDeviation: rating.ratingDeviation,
    provisional: rating.provisional,
    games: rating.games,
    fetchedAt: Timestamp.fromDate(fetchedAt)
  };
}

function toBadge(rating: LichessRating) {
  return {
    provider: "lichess",
    speed: rating.speed,
    value: rating.value,
    provisional: rating.provisional
  };
}

function toLichessAccountId(normalizedUsername: string): string {
  return `lichess:${normalizedUsername}`;
}

function isLichessSpeed(value: unknown): value is LichessRating["speed"] {
  return value === "bullet" || value === "blitz" || value === "rapid" || value === "classical";
}
