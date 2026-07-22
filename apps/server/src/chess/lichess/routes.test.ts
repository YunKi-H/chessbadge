import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { createFirebaseAuthPreHandler, registerFirebaseAuthentication } from "../../auth/firebase.js";
import type { StoredLichessAccount } from "../../firebase/lichess-accounts.js";
import type { LichessPlayer } from "./client.js";
import { registerLichessRoutes, type LichessRouteDependencies } from "./routes.js";

const player: LichessPlayer = {
  username: "TestUser",
  normalizedUsername: "testuser",
  playerId: "testuser",
  profileUrl: "https://lichess.org/@/TestUser",
  avatarUrl: null,
  status: "active",
  ratings: [{
    speed: "rapid",
    value: 1920,
    ratingDeviation: 45,
    provisional: false,
    games: 25
  }]
};

const stored: StoredLichessAccount = {
  ...player,
  verified: true,
  selectedSpeed: "rapid",
  ratingsFetchedAt: new Date("2026-07-23T00:00:00.000Z"),
  manualRefreshAvailableAt: new Date("2026-07-23T00:05:00.000Z")
};

test("Lichess account routes require Firebase authentication", async () => {
  const app = await createApp();
  const response = await app.inject({ method: "GET", url: "/api/chess/lichess/account" });
  assert.equal(response.statusCode, 401);
  await app.close();
});

test("starts Lichess OAuth with server-held PKCE state", async () => {
  let issuedVerifier = "";
  const app = await createApp({
    issueState: (value) => {
      issuedVerifier = value.codeVerifier;
      return "state";
    }
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/lichess/start",
    headers: { authorization: "Bearer valid-token" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(issuedVerifier, "verifier");
  assert.equal(response.json().authorizationUrl, "https://lichess.test/oauth?state=state");
  await app.close();
});

test("connects the callback identity and immediately revokes its token", async () => {
  const operations: string[] = [];
  const app = await createApp({
    consumeState: () => ({
      uid: "chzzk:viewer",
      chzzkChannelId: "viewer",
      codeVerifier: "verifier"
    }),
    exchangeCode: async () => {
      operations.push("exchange");
      return "access-token";
    },
    getCurrentPlayer: async () => {
      operations.push("profile");
      return player;
    },
    saveAccount: async () => {
      operations.push("save");
      return stored;
    },
    revokeToken: async () => {
      operations.push("revoke");
    }
  });
  const response = await app.inject({
    method: "GET",
    url: "/api/auth/lichess/callback?code=code&state=state"
  });

  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, "https://elobadge.test/viewer?lichess=connected");
  assert.deepEqual(operations, ["exchange", "profile", "save", "revoke"]);
  await app.close();
});

async function createApp(overrides: Partial<LichessRouteDependencies> = {}) {
  const app = Fastify();
  await registerFirebaseAuthentication(app);
  const authenticate = createFirebaseAuthPreHandler(async () => ({
    uid: "chzzk:viewer",
    provider: "chzzk",
    chzzkChannelId: "viewer"
  }));
  await registerLichessRoutes(app, {
    authenticate,
    issueState: () => "state",
    consumeState: () => null,
    createVerifier: () => "verifier",
    createAuthorizationUrl: (state) => new URL(`https://lichess.test/oauth?state=${state}`),
    exchangeCode: async () => "access-token",
    getCurrentPlayer: async () => player,
    getPlayer: async () => player,
    revokeToken: async () => undefined,
    getAccount: async () => null,
    saveAccount: async () => stored,
    refreshAccount: async () => stored,
    disconnectAccount: async () => true,
    invalidateBadge: () => undefined,
    webAppUrl: () => "https://elobadge.test",
    ...overrides
  });
  return app;
}
