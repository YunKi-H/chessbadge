import type {
  ChessBadges,
  ChessProvider,
  ChessSpeed,
  RatingBadge
} from "@elobadge/core";
import {
  FieldValue,
  Timestamp,
  type Transaction
} from "firebase-admin/firestore";
import { getHighestRating } from "../chess/rating-selection.js";
import { getFirestoreDb } from "./admin.js";
import {
  getChzzkChessBadgeState,
  parseChzzkChessBadgeState,
  type ChzzkChessBadgeState
} from "./chess-badges.js";

export class ChessBadgePreferenceError extends Error {
  constructor(public readonly code: "identity_mismatch" | "badge_unavailable") {
    super(code);
    this.name = "ChessBadgePreferenceError";
  }
}

export async function getChessBadgePreference(
  uid: string,
  chzzkChannelId: string
): Promise<ChzzkChessBadgeState> {
  return reconcileLinkedChessBadges(uid, chzzkChannelId);
}

async function reconcileLinkedChessBadges(
  uid: string,
  chzzkChannelId: string
): Promise<ChzzkChessBadgeState> {
  const db = getFirestoreDb();
  const chzzkRef = db.collection("chzzkAccounts").doc(chzzkChannelId);

  return db.runTransaction(async (transaction) => {
    const [snapshot, userSnapshot] = await Promise.all([
      transaction.get(chzzkRef),
      transaction.get(db.collection("users").doc(uid))
    ]);

    if (snapshot.data()?.uid !== uid) {
      throw new ChessBadgePreferenceError("identity_mismatch");
    }

    const state = parseChzzkChessBadgeState(snapshot.data());
    const accountIds = userSnapshot.data()?.chessAccountIds;
    const linkedBadges = await Promise.all(
      (["chesscom", "lichess"] as const).map(async (provider) => {
        const accountId = accountIds?.[provider];
        return typeof accountId === "string"
          ? deriveLinkedBadge(transaction, uid, accountId, provider)
          : null;
      })
    );
    const badges: ChessBadges = { ...state.badges };
    for (const badge of linkedBadges) {
      if (badge) {
        badges[badge.provider] = badge;
      }
    }

    const preferredProvider =
      state.preferredProvider && badges[state.preferredProvider]
        ? state.preferredProvider
        : badges.chesscom
          ? "chesscom"
          : badges.lichess
            ? "lichess"
            : null;
    const reconciled = { badges, preferredProvider };

    if (!sameBadgeState(state, reconciled)) {
      transaction.update(chzzkRef, {
        badges,
        preferredChessProvider: preferredProvider ?? FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    return reconciled;
  });
}

export async function updateChessBadgePreference(
  uid: string,
  chzzkChannelId: string,
  provider: ChessProvider
): Promise<ChzzkChessBadgeState> {
  const db = getFirestoreDb();
  const ref = db.collection("chzzkAccounts").doc(chzzkChannelId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (data?.uid !== uid) {
      throw new ChessBadgePreferenceError("identity_mismatch");
    }

    const state = parseChzzkChessBadgeState(data);
    const badge = state.badges[provider];

    if (!badge) {
      throw new ChessBadgePreferenceError("badge_unavailable");
    }

    transaction.update(ref, {
      badges: state.badges,
      preferredChessProvider: provider,
      updatedAt: FieldValue.serverTimestamp()
    });
  });

  return getChzzkChessBadgeState(chzzkChannelId);
}

async function deriveLinkedBadge(
  transaction: Transaction,
  uid: string,
  accountId: string,
  provider: ChessProvider
): Promise<RatingBadge | null> {
  const accountRef = getFirestoreDb().collection("chessAccounts").doc(accountId);
  const ratingRefs = getProviderSpeeds(provider).map((speed) =>
    accountRef.collection("ratings").doc(speed)
  );
  const [accountSnapshot, ...ratingSnapshots] = await Promise.all([
    transaction.get(accountRef),
    ...ratingRefs.map((ratingRef) => transaction.get(ratingRef))
  ]);
  const account = accountSnapshot.data();
  if (
    account?.uid !== uid ||
    account.provider !== provider ||
    !(account.verifiedAt instanceof Timestamp)
  ) {
    return null;
  }

  const highest = getHighestRating(
    ratingSnapshots.flatMap((document) => {
      const rating = document.data();
      const speed = document.id;
      if (
        !rating ||
        !isProviderSpeed(provider, speed) ||
        typeof rating.value !== "number"
      ) {
        return [];
      }
      return [{
        speed,
        value: rating.value,
        provisional: provider === "lichess" && rating.provisional === true
      }];
    })
  );

  return highest
    ? { provider, ...highest }
    : null;
}

function getProviderSpeeds(provider: ChessProvider): readonly ChessSpeed[] {
  return provider === "lichess"
    ? ["bullet", "blitz", "rapid", "classical"]
    : ["bullet", "blitz", "rapid"];
}

function isProviderSpeed(
  provider: ChessProvider,
  speed: string
): speed is ChessSpeed {
  return (
    speed === "bullet" ||
    speed === "blitz" ||
    speed === "rapid" ||
    (provider === "lichess" && speed === "classical")
  );
}

function sameBadgeState(
  left: ChzzkChessBadgeState,
  right: ChzzkChessBadgeState
): boolean {
  return (
    left.preferredProvider === right.preferredProvider &&
    sameBadge(left.badges.chesscom, right.badges.chesscom) &&
    sameBadge(left.badges.lichess, right.badges.lichess)
  );
}

function sameBadge(
  left: RatingBadge | undefined,
  right: RatingBadge | undefined
): boolean {
  return (
    left?.provider === right?.provider &&
    left?.speed === right?.speed &&
    left?.value === right?.value &&
    left?.provisional === right?.provisional
  );
}
