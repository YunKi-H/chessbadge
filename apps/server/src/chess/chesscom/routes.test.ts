import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createFirebaseAuthPreHandler, registerFirebaseAuthentication } from "../../auth/firebase.js";
import { ChessComClientError, type ChessComPlayer } from "./client.js";
import { registerChessComRoutes, type ChessComRouteDependencies } from "./routes.js";

const player: ChessComPlayer = {
  username: "TestUser",
  normalizedUsername: "testuser",
  playerId: "42",
  profileUrl: "https://www.chess.com/member/testuser",
  avatarUrl: null,
  location: null,
  status: "basic",
  ratings: [
    {
      speed: "rapid",
      value: 1520,
      ratingDeviation: 54,
      providerUpdatedAt: new Date("2026-07-15T00:00:00.000Z")
    }
  ]
};

test("Chess.com account routes require Firebase authentication", async () => {
  const app = await createApp();
  const response = await app.inject({
    method: "GET",
    url: "/api/chess/chesscom/account"
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test("backfills the highest badge for an already verified account", async () => {
  let reads = 0;
  let ensured = false;
  const app = await createApp({
    getAccount: async () => {
      reads += 1;
      return {
        ...player,
        verified: true,
        selectedSpeed: reads === 1 ? null : "rapid"
      };
    },
    ensureHighestBadge: async () => {
      ensured = true;
      return true;
    }
  });
  const response = await app.inject({
    method: "GET",
    url: "/api/chess/chesscom/account",
    headers: { authorization: "Bearer valid-token" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(ensured, true);
  assert.equal(response.json().account.selectedSpeed, "rapid");
  await app.close();
});

test("creates a Chess.com location verification challenge", async () => {
  const app = await createApp({
    createVerification: async () => ({
      code: "chessbadge-test-code",
      expiresAt: new Date("2026-07-17T00:00:00.000Z")
    })
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/chess/chesscom/verification",
    headers: { authorization: "Bearer valid-token" }
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json().verification, {
    code: "chessbadge-test-code",
    expiresAt: "2026-07-17T00:00:00.000Z"
  });
  await app.close();
});

test("confirms ownership from the Chess.com location field", async () => {
  let completedLocation: string | null = null;
  const app = await createApp({
    getProfile: async () => ({ ...player, location: "chessbadge-test-code" }),
    getPendingVerification: async () => ({
      accountId: "chesscom:testuser",
      username: "TestUser",
      playerId: "42"
    }),
    completeVerification: async (_uid, _accountId, _playerId, location) => {
      completedLocation = location;
    },
    getAccount: async () => ({ ...player, verified: true, selectedSpeed: null })
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/chess/chesscom/verification/confirm",
    headers: { authorization: "Bearer valid-token" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(completedLocation, "chessbadge-test-code");
  assert.equal(response.json().account.verified, true);
  await app.close();
});

test("links a fetched Chess.com account as unverified", async () => {
  let savedUid: string | null = null;
  const app = await createApp({
    getPlayer: async () => player,
    saveAccount: async (uid, fetchedPlayer) => {
      savedUid = uid;
      return { ...fetchedPlayer, verified: false, selectedSpeed: null };
    }
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/chess/chesscom/account",
    headers: { authorization: "Bearer valid-token" },
    payload: { username: "TestUser" }
  });

  assert.equal(response.statusCode, 201);
  assert.equal(savedUid, "chzzk:viewer");
  assert.equal(response.json().account.verified, false);
  assert.equal(response.json().account.ratings[0].value, 1520);
  await app.close();
});

test("returns 404 when the Chess.com account does not exist", async () => {
  const app = await createApp({
    getPlayer: async () => {
      throw new ChessComClientError("not_found", "not found", 404);
    }
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/chess/chesscom/account",
    headers: { authorization: "Bearer valid-token" },
    payload: { username: "missing-user" }
  });

  assert.equal(response.statusCode, 404);
  await app.close();
});

async function createApp(overrides: Partial<ChessComRouteDependencies> = {}) {
  const app = Fastify();
  await registerFirebaseAuthentication(app);
  const authenticate = createFirebaseAuthPreHandler(async () => ({
    uid: "chzzk:viewer",
    provider: "chzzk",
    chzzkChannelId: "viewer"
  }));
  await registerChessComRoutes(app, {
    authenticate,
    getPlayer: async () => player,
    getProfile: async () => player,
    getAccount: async () => null,
    saveAccount: async (_uid, fetchedPlayer) => ({
      ...fetchedPlayer,
      verified: false,
      selectedSpeed: null
    }),
    createVerification: async () => ({
      code: "chessbadge-test-code",
      expiresAt: new Date("2026-07-17T00:00:00.000Z")
    }),
    getPendingVerification: async () => ({
      accountId: "chesscom:testuser",
      username: "TestUser",
      playerId: "42"
    }),
    completeVerification: async () => undefined,
    ensureHighestBadge: async () => false,
    invalidateBadge: () => undefined,
    ...overrides
  });
  return app;
}
