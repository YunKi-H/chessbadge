import { createHash, randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirestoreDb } from "./admin.js";
import { getHighestChessComRating } from "../chess/rating-selection.js";
import { getNextChessComRefreshAt } from "../chess/chesscom/rating-refresh-policy.js";
import {
  parseChzzkChessBadgeState,
  selectPreferredChessProvider
} from "./chess-badges.js";

const CHALLENGE_LIFETIME_MS = 48 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;

export type ChessVerificationErrorCode =
  | "account_missing"
  | "already_verified"
  | "challenge_missing"
  | "challenge_expired"
  | "attempts_exhausted"
  | "identity_changed"
  | "location_mismatch";

export class ChessVerificationError extends Error {
  constructor(public readonly code: ChessVerificationErrorCode) {
    super(code);
    this.name = "ChessVerificationError";
  }
}

export interface ChessComVerificationChallenge {
  code: string;
  expiresAt: Date;
}

export interface PendingChessComVerification {
  accountId: string;
  username: string;
  playerId: string;
}

export async function createChessComLocationChallenge(
  uid: string
): Promise<ChessComVerificationChallenge> {
  const db = getFirestoreDb();
  const userRef = db.collection("users").doc(uid);
  const code = `elobadge-${randomBytes(10).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + CHALLENGE_LIFETIME_MS);

  await db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const accountId = userSnapshot.data()?.chessAccountIds?.chesscom;

    if (typeof accountId !== "string") {
      throw new ChessVerificationError("account_missing");
    }

    const accountRef = db.collection("chessAccounts").doc(accountId);
    const accountSnapshot = await transaction.get(accountRef);
    const account = accountSnapshot.data();

    if (!account || account.uid !== uid || account.provider !== "chesscom") {
      throw new ChessVerificationError("account_missing");
    }

    if (account.verifiedAt instanceof Timestamp) {
      throw new ChessVerificationError("already_verified");
    }

    transaction.set(db.collection("chessVerificationChallenges").doc(accountId), {
      uid,
      accountId,
      provider: "chesscom",
      providerUserId: String(account.providerUserId),
      codeHash: hashVerificationValue(code),
      failedAttempts: 0,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: FieldValue.serverTimestamp()
    });
  });

  return { code, expiresAt };
}

export async function getPendingChessComLocationChallenge(
  uid: string
): Promise<PendingChessComVerification> {
  const db = getFirestoreDb();
  const userSnapshot = await db.collection("users").doc(uid).get();
  const accountId = userSnapshot.data()?.chessAccountIds?.chesscom;

  if (typeof accountId !== "string") {
    throw new ChessVerificationError("account_missing");
  }

  const [accountSnapshot, challengeSnapshot] = await Promise.all([
    db.collection("chessAccounts").doc(accountId).get(),
    db.collection("chessVerificationChallenges").doc(accountId).get()
  ]);
  const account = accountSnapshot.data();
  const challenge = challengeSnapshot.data();

  if (!account || account.uid !== uid || account.provider !== "chesscom") {
    throw new ChessVerificationError("account_missing");
  }

  if (account.verifiedAt instanceof Timestamp) {
    throw new ChessVerificationError("already_verified");
  }

  validateChallenge(challenge, uid);

  return {
    accountId,
    username: String(account.username),
    playerId: String(challenge?.providerUserId)
  };
}

export async function completeChessComLocationVerification(
  uid: string,
  accountId: string,
  playerId: string,
  location: string | null
): Promise<void> {
  const db = getFirestoreDb();
  const userRef = db.collection("users").doc(uid);
  const accountRef = db.collection("chessAccounts").doc(accountId);
  const challengeRef = db.collection("chessVerificationChallenges").doc(accountId);
  const chzzkChannelId = uid.startsWith("chzzk:") ? uid.slice(6) : null;
  const chzzkAccountRef = chzzkChannelId
    ? db.collection("chzzkAccounts").doc(chzzkChannelId)
    : null;

  const result = await db.runTransaction(async (transaction) => {
    const [userSnapshot, accountSnapshot, challengeSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(accountRef),
      transaction.get(challengeRef)
    ]);
    const account = accountSnapshot.data();
    const challenge = challengeSnapshot.data();

    if (
      userSnapshot.data()?.chessAccountIds?.chesscom !== accountId ||
      !account ||
      account.uid !== uid ||
      account.provider !== "chesscom"
    ) {
      throw new ChessVerificationError("account_missing");
    }

    if (account.verifiedAt instanceof Timestamp) {
      throw new ChessVerificationError("already_verified");
    }

    validateChallenge(challenge, uid);

    if (
      String(account.providerUserId) !== playerId ||
      String(challenge?.providerUserId) !== playerId
    ) {
      throw new ChessVerificationError("identity_changed");
    }

    if (
      typeof location !== "string" ||
      hashVerificationValue(location.trim()) !== challenge?.codeHash
    ) {
      transaction.update(challengeRef, {
        failedAttempts: FieldValue.increment(1),
        lastAttemptAt: FieldValue.serverTimestamp()
      });
      return "location_mismatch" as const;
    }

    const ratingRefs = (["bullet", "blitz", "rapid"] as const).map((speed) =>
      accountRef.collection("ratings").doc(speed)
    );
    const ratingSnapshots = await Promise.all(
      ratingRefs.map((ratingRef) => transaction.get(ratingRef))
    );
    const chzzkAccountSnapshot = chzzkAccountRef
      ? await transaction.get(chzzkAccountRef)
      : null;
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
    const chessComBadge = highestRating
      ? {
          provider: "chesscom" as const,
          speed: highestRating.speed,
          value: highestRating.value,
          provisional: false
        }
      : null;
    const currentState = parseChzzkChessBadgeState(chzzkAccountSnapshot?.data());
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

    const now = FieldValue.serverTimestamp();
    const verifiedAt = new Date();
    transaction.update(accountRef, {
      verifiedAt: now,
      verificationMethod: "profile_location",
      selectedSpeed: highestRating?.speed ?? null,
      nextRatingRefreshAt: Timestamp.fromDate(
        getNextChessComRefreshAt(verifiedAt)
      ),
      ratingRefreshStatus: "idle",
      ratingRefreshFailureCount: 0,
      updatedAt: now
    });
    transaction.update(userRef, {
      activeChessProvider: FieldValue.delete(),
      updatedAt: now
    });
    if (chzzkAccountRef) {
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
    transaction.delete(challengeRef);
    return "verified" as const;
  });

  if (result === "location_mismatch") {
    throw new ChessVerificationError("location_mismatch");
  }
}

function validateChallenge(
  challenge: FirebaseFirestore.DocumentData | undefined,
  uid: string
): void {
  if (!challenge || challenge.uid !== uid) {
    throw new ChessVerificationError("challenge_missing");
  }

  if (
    !(challenge.expiresAt instanceof Timestamp) ||
    challenge.expiresAt.toMillis() <= Date.now()
  ) {
    throw new ChessVerificationError("challenge_expired");
  }

  if (
    typeof challenge.failedAttempts !== "number" ||
    challenge.failedAttempts >= MAX_FAILED_ATTEMPTS
  ) {
    throw new ChessVerificationError("attempts_exhausted");
  }

  if (typeof challenge.codeHash !== "string") {
    throw new ChessVerificationError("challenge_missing");
  }
}

function hashVerificationValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}
