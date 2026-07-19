import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { deleteApp } from "firebase-admin/app";
import { Timestamp } from "firebase-admin/firestore";
import type { ChessComPlayer } from "../../chess/chesscom/client.js";
import {
  ChessAccountConflictError,
  disconnectChessComAccount,
  getUserChessComAccount,
  saveUnverifiedChessComAccount
} from "../chess-accounts.js";
import { getFirebaseAdminApp, getFirestoreDb } from "../admin.js";
import { getChzzkRatingBadge } from "../chess-badges.js";
import {
  ChessVerificationError,
  completeChessComLocationVerification,
  createChessComLocationChallenge
} from "../chess-verifications.js";
import { deleteExpiredChessVerificationChallenges } from "../chess-verification-cleanup.js";
import {
  ChessRatingRefreshError,
  claimManualChessComRatingRefresh,
  completeChessComRatingRefresh
} from "../chess-rating-refresh.js";
import {
  enableStreamerOverlayAccess,
  getStreamerOverlayAccess,
  rotateStreamerOverlayAccess,
  updateStreamerOverlayAppearance
} from "../overlays.js";

const projectId = "demo-elobadge-emulator";
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

if (!emulatorHost) {
  throw new Error("Run this test through pnpm test:emulator");
}

process.env.FIREBASE_PROJECT_ID = projectId;
delete process.env.FIREBASE_CLIENT_EMAIL;
delete process.env.FIREBASE_PRIVATE_KEY;
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

beforeEach(async () => {
  const response = await fetch(
    `http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" }
  );

  assert.equal(response.ok, true, await response.text());
});

after(async () => {
  await deleteApp(getFirebaseAdminApp());
});

test("Chess.com verification selects the highest badge and disconnect clears it", async () => {
  const uid = "chzzk:viewer-channel";
  const channelId = "viewer-channel";
  const player = createPlayer();
  const db = getFirestoreDb();

  await db.collection("chzzkAccounts").doc(channelId).set({ uid, badge: null });

  const saved = await saveUnverifiedChessComAccount(uid, player);
  assert.equal(saved.verified, false);
  assert.equal(saved.selectedSpeed, null);
  assert.deepEqual(await getChzzkRatingBadge(channelId), null);

  const challenge = await createChessComLocationChallenge(uid);
  const accountId = `chesscom:${player.normalizedUsername}`;

  await assert.rejects(
    completeChessComLocationVerification(uid, accountId, player.playerId, "wrong-code"),
    (error: unknown) =>
      error instanceof ChessVerificationError && error.code === "location_mismatch"
  );

  const failedChallenge = await db
    .collection("chessVerificationChallenges")
    .doc(accountId)
    .get();
  assert.equal(failedChallenge.data()?.failedAttempts, 1);

  await completeChessComLocationVerification(
    uid,
    accountId,
    player.playerId,
    `  ${challenge.code}  `
  );

  const linkedAccount = await getUserChessComAccount(uid);
  assert.equal(linkedAccount?.verified, true);
  assert.equal(linkedAccount?.selectedSpeed, "rapid");
  assert.deepEqual(await getChzzkRatingBadge(channelId), {
    provider: "chesscom",
    speed: "rapid",
    value: 1800,
    provisional: false
  });
  assert.equal(
    (await db.collection("chessVerificationChallenges").doc(accountId).get()).exists,
    false
  );

  const refreshTime = new Date("2026-07-15T12:00:00.000Z");
  await db.collection("chessAccounts").doc(accountId).update({
    manualRefreshAvailableAt: Timestamp.fromMillis(refreshTime.getTime() - 1)
  });
  const refreshClaim = await claimManualChessComRatingRefresh(uid, refreshTime);
  const refreshedPlayer = {
    ...player,
    ratings: [
      { ...player.ratings[0]!, value: 1900 },
      { ...player.ratings[2]!, value: 1850 }
    ]
  };
  await completeChessComRatingRefresh(
    refreshClaim,
    refreshedPlayer,
    refreshTime,
    new Date("2026-07-16T00:00:00.000Z")
  );

  assert.deepEqual(await getChzzkRatingBadge(channelId), {
    provider: "chesscom",
    speed: "bullet",
    value: 1900,
    provisional: false
  });
  assert.equal(
    (await db.collection("chessAccounts").doc(accountId).collection("ratings").doc("blitz").get()).exists,
    false
  );
  await assert.rejects(
    claimManualChessComRatingRefresh(
      uid,
      new Date(refreshTime.getTime() + 60_000)
    ),
    (error: unknown) =>
      error instanceof ChessRatingRefreshError && error.code === "cooldown"
  );

  assert.equal(await disconnectChessComAccount(uid, channelId), true);
  assert.equal(await getUserChessComAccount(uid), null);
  assert.equal(await getChzzkRatingBadge(channelId), null);

  const deletedAccount = await db.collection("chessAccounts").doc(accountId).get();
  assert.equal(deletedAccount.exists, false);
  for (const speed of ["bullet", "blitz", "rapid"]) {
    const deletedRating = await db
      .collection("chessAccounts")
      .doc(accountId)
      .collection("ratings")
      .doc(speed)
      .get();
    assert.equal(deletedRating.exists, false);
  }

  assert.equal(await disconnectChessComAccount(uid, channelId), true);
});

test("one Chess.com account cannot be linked to two Chzzk users", async () => {
  const player = createPlayer();

  await saveUnverifiedChessComAccount("chzzk:first", player);

  await assert.rejects(
    saveUnverifiedChessComAccount("chzzk:second", player),
    (error: unknown) => error instanceof ChessAccountConflictError
  );
});

test("verification cleanup deletes only expired challenges", async () => {
  const db = getFirestoreDb();
  const now = new Date("2026-07-20T00:00:00.000Z");
  const challenges = db.collection("chessVerificationChallenges");

  await Promise.all([
    challenges.doc("expired").set({
      expiresAt: Timestamp.fromMillis(now.getTime() - 1)
    }),
    challenges.doc("active").set({
      expiresAt: Timestamp.fromMillis(now.getTime() + 1)
    }),
    challenges.doc("legacy-without-expiry").set({ createdAt: Timestamp.now() })
  ]);

  assert.equal(await deleteExpiredChessVerificationChallenges(now), 1);
  assert.equal((await challenges.doc("expired").get()).exists, false);
  assert.equal((await challenges.doc("active").get()).exists, true);
  assert.equal((await challenges.doc("legacy-without-expiry").get()).exists, true);
});

test("deployed Firestore rules deny direct unauthenticated client access", async () => {
  const response = await fetch(
    `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents/users/direct-client`
  );

  assert.equal(response.status, 403);
});

test("overlay appearance persists and survives public token rotation", async () => {
  const uid = "chzzk:streamer-channel";
  const db = getFirestoreDb();
  await db.collection("streamers").doc(uid).set({ uid });

  const initial = await enableStreamerOverlayAccess(uid);
  assert.deepEqual(initial.appearance, {
    messageMaxWidthPx: 600,
    backgroundVisible: true,
    backgroundColor: "#020617",
    backgroundOpacity: 90,
    chzzkBadgesVisible: true,
    chzzkBadgeVisibility: {
      role: true,
      subscription: true,
      donation: true,
      subscription_gift: true,
      unknown: true
    },
    nicknameVisible: true,
    nicknameColorMode: "fixed",
    nicknameColor: "#7DD3FC",
    nicknameRoleColors: {
      streamer: "#34D399",
      manager: "#60A5FA",
      donator: "#FBBF24",
      subscriber: "#C084FC",
      viewer: "#E2E8F0"
    },
    messageColorMode: "fixed",
    messageColor: "#FFFFFF",
    messageRoleColors: {
      streamer: "#86EFAC",
      manager: "#93C5FD",
      donator: "#FDE68A",
      subscriber: "#D8B4FE",
      viewer: "#FFFFFF"
    },
    fontFamily: "system",
    fontSizePx: 18,
    fontWeight: 400,
    fontLineHeight: 1.4,
    messageDurationSeconds: 20
  });

  const appearance = {
    messageMaxWidthPx: 480,
    backgroundVisible: false,
    backgroundColor: "#172554",
    backgroundOpacity: 45,
    chzzkBadgesVisible: false,
    chzzkBadgeVisibility: {
      role: false,
      subscription: true,
      donation: false,
      subscription_gift: true,
      unknown: false
    },
    nicknameVisible: false,
    nicknameColorMode: "by_user" as const,
    nicknameColor: "#FDE047",
    nicknameRoleColors: {
      streamer: "#34D399",
      manager: "#60A5FA",
      donator: "#FBBF24",
      subscriber: "#C084FC",
      viewer: "#E2E8F0"
    },
    messageColorMode: "by_role" as const,
    messageColor: "#7DD3FC",
    messageRoleColors: {
      streamer: "#86EFAC",
      manager: "#93C5FD",
      donator: "#FDE68A",
      subscriber: "#D8B4FE",
      viewer: "#FFFFFF"
    },
    fontFamily: "freesentation" as const,
    fontSizePx: 22,
    fontWeight: 600 as const,
    fontLineHeight: 1.6 as const,
    messageDurationSeconds: 60 as const
  };
  await updateStreamerOverlayAppearance(uid, appearance);
  assert.deepEqual((await getStreamerOverlayAccess(uid))?.appearance, appearance);

  const rotated = await rotateStreamerOverlayAccess(uid);
  assert.notEqual(rotated.publicToken, initial.publicToken);
  assert.deepEqual(rotated.appearance, appearance);
  assert.equal(
    (await db.collection("overlays").doc(initial.publicToken).get()).data()?.active,
    false
  );
});

function createPlayer(): ChessComPlayer {
  return {
    username: "TestPlayer",
    normalizedUsername: "testplayer",
    playerId: "123456",
    profileUrl: "https://www.chess.com/member/testplayer",
    avatarUrl: null,
    location: null,
    status: "premium",
    ratings: [
      {
        speed: "bullet",
        value: 1650,
        ratingDeviation: 45,
        providerUpdatedAt: new Date("2026-07-01T00:00:00.000Z")
      },
      {
        speed: "blitz",
        value: 1800,
        ratingDeviation: 40,
        providerUpdatedAt: new Date("2026-07-02T00:00:00.000Z")
      },
      {
        speed: "rapid",
        value: 1800,
        ratingDeviation: 35,
        providerUpdatedAt: new Date("2026-07-03T00:00:00.000Z")
      }
    ]
  };
}
