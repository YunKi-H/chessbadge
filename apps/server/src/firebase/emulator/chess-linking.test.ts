import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { deleteApp } from "firebase-admin/app";
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

const projectId = "demo-chessbadge-emulator";
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

  assert.equal(await disconnectChessComAccount(uid, channelId), true);
  assert.equal(await getUserChessComAccount(uid), null);
  assert.equal(await getChzzkRatingBadge(channelId), null);

  const detachedAccount = await db.collection("chessAccounts").doc(accountId).get();
  assert.equal(detachedAccount.data()?.uid, null);
  assert.equal(detachedAccount.data()?.selectedSpeed, null);
  assert.equal(detachedAccount.data()?.verifiedAt, null);
});

test("one Chess.com account cannot be linked to two Chzzk users", async () => {
  const player = createPlayer();

  await saveUnverifiedChessComAccount("chzzk:first", player);

  await assert.rejects(
    saveUnverifiedChessComAccount("chzzk:second", player),
    (error: unknown) => error instanceof ChessAccountConflictError
  );
});

test("deployed Firestore rules deny direct unauthenticated client access", async () => {
  const response = await fetch(
    `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents/users/direct-client`
  );

  assert.equal(response.status, 403);
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
