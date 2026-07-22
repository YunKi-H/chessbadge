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
import { deleteUserFirestoreData } from "../account-deletion.js";
import { deleteOrphanedInactiveOverlays } from "../overlay-cleanup.js";
import {
  getChzzkChessBadgeState,
  getChzzkRatingBadge
} from "../chess-badges.js";
import {
  disconnectLichessAccount,
  getUserLichessAccount,
  saveVerifiedLichessAccount
} from "../lichess-accounts.js";
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
import { getChessBadgePreference } from "../chess-preferences.js";
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

test("Lichess OAuth linking stores ratings, selects a badge, and disconnects", async () => {
  const uid = "chzzk:lichess-viewer";
  const channelId = "lichess-viewer";
  const db = getFirestoreDb();
  await Promise.all([
    db.collection("users").doc(uid).set({ displayName: "viewer" }),
    db.collection("chzzkAccounts").doc(channelId).set({ uid, badge: null })
  ]);

  const account = await saveVerifiedLichessAccount(uid, channelId, {
    username: "LichessViewer",
    normalizedUsername: "lichessviewer",
    playerId: "lichessviewer",
    profileUrl: "https://lichess.org/@/LichessViewer",
    avatarUrl: null,
    status: "active",
    ratings: [
      { speed: "blitz", value: 1900, ratingDeviation: 50, provisional: false, games: 30 },
      { speed: "classical", value: 2050, ratingDeviation: 70, provisional: true, games: 8 }
    ]
  });

  assert.equal(account.selectedSpeed, "classical");
  assert.equal((await getUserLichessAccount(uid))?.username, "LichessViewer");
  assert.deepEqual(await getChzzkRatingBadge(channelId), {
    provider: "lichess",
    speed: "classical",
    value: 2050,
    provisional: true
  });

  assert.equal(await disconnectLichessAccount(uid, channelId), true);
  assert.equal(await getUserLichessAccount(uid), null);
  assert.equal(await getChzzkRatingBadge(channelId), null);
});

test("disconnect switches the badge preference to the remaining linked provider", async () => {
  const uid = "chzzk:dual-provider-viewer";
  const channelId = "dual-provider-viewer";
  const chessComAccountId = "chesscom:dual-player";
  const lichessAccountId = "lichess:dual-player";
  const chessComBadge = {
    provider: "chesscom",
    speed: "rapid",
    value: 1800,
    provisional: false
  } as const;
  const lichessBadge = {
    provider: "lichess",
    speed: "blitz",
    value: 1900,
    provisional: false
  } as const;
  const db = getFirestoreDb();

  await Promise.all([
    db.collection("users").doc(uid).set({
      chessAccountIds: {
        chesscom: chessComAccountId,
        lichess: lichessAccountId
      },
      activeChessProvider: "lichess"
    }),
    db.collection("chzzkAccounts").doc(channelId).set({
      uid,
      badges: { chesscom: chessComBadge, lichess: lichessBadge },
      preferredChessProvider: "lichess",
      badge: lichessBadge
    }),
    db.collection("chessAccounts").doc(chessComAccountId).set({
      uid,
      provider: "chesscom"
    }),
    db.collection("chessAccounts").doc(lichessAccountId).set({
      uid,
      provider: "lichess"
    })
  ]);

  assert.equal(await disconnectLichessAccount(uid, channelId), true);
  assert.deepEqual(await getChzzkChessBadgeState(channelId), {
    badges: { chesscom: chessComBadge },
    preferredProvider: "chesscom"
  });
  assert.deepEqual(
    (await db.collection("chzzkAccounts").doc(channelId).get()).data()?.badge,
    chessComBadge
  );

  assert.equal(await disconnectChessComAccount(uid, channelId), true);
  assert.deepEqual(await getChzzkChessBadgeState(channelId), {
    badges: {},
    preferredProvider: null
  });
  assert.equal(
    (await db.collection("chzzkAccounts").doc(channelId).get()).data()?.badge,
    null
  );
});

test("badge preference restores a missing provider badge from linked accounts", async () => {
  const uid = "chzzk:legacy-dual-viewer";
  const channelId = "legacy-dual-viewer";
  const chessComAccountId = "chesscom:legacy-dual";
  const lichessAccountId = "lichess:legacy-dual";
  const db = getFirestoreDb();
  const chessComBadge = {
    provider: "chesscom",
    speed: "rapid",
    value: 1750,
    provisional: false
  } as const;

  await Promise.all([
    db.collection("users").doc(uid).set({
      chessAccountIds: {
        chesscom: chessComAccountId,
        lichess: lichessAccountId
      }
    }),
    db.collection("chzzkAccounts").doc(channelId).set({
      uid,
      badges: { chesscom: chessComBadge },
      preferredChessProvider: "chesscom",
      badge: chessComBadge
    }),
    db.collection("chessAccounts").doc(chessComAccountId).set({
      uid,
      provider: "chesscom",
      verifiedAt: Timestamp.now()
    }),
    db.collection("chessAccounts").doc(lichessAccountId).set({
      uid,
      provider: "lichess",
      verifiedAt: Timestamp.now()
    }),
    db.collection("chessAccounts").doc(chessComAccountId)
      .collection("ratings").doc("rapid").set({ value: 1750 }),
    db.collection("chessAccounts").doc(lichessAccountId)
      .collection("ratings").doc("rapid").set({
        value: 1900,
        provisional: false
      })
  ]);

  assert.deepEqual(await getChessBadgePreference(uid, channelId), {
    badges: {
      chesscom: chessComBadge,
      lichess: {
        provider: "lichess",
        speed: "rapid",
        value: 1900,
        provisional: false
      }
    },
    preferredProvider: "chesscom"
  });
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

test("account deletion removes user-owned Firestore data", async () => {
  const db = getFirestoreDb();
  const uid = "chzzk:delete-channel";
  const channelId = "delete-channel";
  const accountId = "chesscom:delete-player";
  const accountRef = db.collection("chessAccounts").doc(accountId);
  const lichessAccountRef = db.collection("chessAccounts").doc("lichess:delete-player");
  const ownedDocuments = [
    db.collection("users").doc(uid),
    db.collection("chzzkAccounts").doc(channelId),
    db.collection("streamers").doc(uid),
    db.collection("chzzkTokens").doc(uid),
    db.collection("overlays").doc("active-overlay"),
    db.collection("overlays").doc("rotated-overlay"),
    accountRef,
    accountRef.collection("ratings").doc("bullet"),
    accountRef.collection("ratings").doc("blitz"),
    accountRef.collection("ratings").doc("rapid"),
    db.collection("chessVerificationChallenges").doc(accountId),
    lichessAccountRef,
    lichessAccountRef.collection("ratings").doc("bullet"),
    lichessAccountRef.collection("ratings").doc("blitz"),
    lichessAccountRef.collection("ratings").doc("rapid"),
    lichessAccountRef.collection("ratings").doc("classical")
  ];

  await Promise.all([
    ownedDocuments[0]!.set({
      chessAccountIds: { chesscom: accountId, lichess: "lichess:delete-player" }
    }),
    ownedDocuments[1]!.set({ uid }),
    ownedDocuments[2]!.set({ overlayToken: "active-overlay" }),
    ownedDocuments[3]!.set({ encryptedAccessToken: "secret" }),
    ownedDocuments[4]!.set({ streamerUid: uid, active: true }),
    ownedDocuments[5]!.set({ streamerUid: uid, active: false }),
    ownedDocuments[6]!.set({ uid, provider: "chesscom" }),
    ownedDocuments[7]!.set({ value: 1000 }),
    ownedDocuments[8]!.set({ value: 1100 }),
    ownedDocuments[9]!.set({ value: 1200 }),
    ownedDocuments[10]!.set({ uid }),
    ownedDocuments[11]!.set({ uid, provider: "lichess" }),
    ownedDocuments[12]!.set({ value: 1300 }),
    ownedDocuments[13]!.set({ value: 1400 }),
    ownedDocuments[14]!.set({ value: 1500 }),
    ownedDocuments[15]!.set({ value: 1600 }),
    db.collection("overlays").doc("another-overlay").set({
      streamerUid: "chzzk:another-channel",
      active: true
    })
  ]);

  const deleted = await deleteUserFirestoreData(uid, channelId);

  assert.deepEqual(deleted.overlayTokens.sort(), [
    "active-overlay",
    "rotated-overlay"
  ]);
  for (const document of ownedDocuments) {
    assert.equal((await document.get()).exists, false);
  }
  assert.equal(
    (await db.collection("overlays").doc("another-overlay").get()).exists,
    true
  );
});

test("overlay cleanup preserves the streamer's current disabled URL", async () => {
  const db = getFirestoreDb();
  const uid = "chzzk:cleanup-streamer";
  const overlays = db.collection("overlays");

  await Promise.all([
    db.collection("streamers").doc(uid).set({
      overlayToken: "current-disabled"
    }),
    overlays.doc("current-disabled").set({ streamerUid: uid, active: false }),
    overlays.doc("rotated-old").set({ streamerUid: uid, active: false }),
    overlays.doc("malformed-old").set({ active: false }),
    overlays.doc("active-overlay").set({ streamerUid: uid, active: true })
  ]);

  assert.deepEqual(await deleteOrphanedInactiveOverlays(), {
    scanned: 3,
    deleted: 2
  });
  assert.equal((await overlays.doc("current-disabled").get()).exists, true);
  assert.equal((await overlays.doc("rotated-old").get()).exists, false);
  assert.equal((await overlays.doc("malformed-old").get()).exists, false);
  assert.equal((await overlays.doc("active-overlay").get()).exists, true);
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
    ratingProviderPolicy: "viewer_choice",
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
    ratingProviderPolicy: "lichess_only" as const,
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
    (await db.collection("overlays").doc(initial.publicToken).get()).exists,
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
