import assert from "node:assert/strict";
import test from "node:test";
import {
  createLichessAuthorizationUrl,
  createLichessClient,
  createLichessCodeChallenge
} from "./client.js";

const config = {
  clientId: "elobadge.com",
  redirectUri: "https://elobadge.com/api/auth/lichess/callback",
  baseUrl: "https://lichess.test"
};

test("creates a Lichess PKCE authorization URL without scopes", () => {
  const challenge = createLichessCodeChallenge("verifier");
  const url = createLichessAuthorizationUrl(config, "state", challenge);

  assert.equal(url.pathname, "/oauth");
  assert.equal(url.searchParams.get("client_id"), "elobadge.com");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), challenge);
  assert.equal(url.searchParams.has("scope"), false);
});

test("maps standard Lichess ratings and provisional state", async () => {
  const client = createLichessClient(config, async () => new Response(JSON.stringify({
    id: "testuser",
    username: "TestUser",
    url: "https://lichess.org/@/TestUser",
    perfs: {
      bullet: { games: 0, rating: 1500, rd: 500, prog: 0 },
      blitz: { games: 12, rating: 1810, rd: 55, prog: 10, prov: true },
      rapid: { games: 20, rating: 1900, rd: 45, prog: -2 }
    }
  }), { status: 200, headers: { "Content-Type": "application/json" } }));

  const player = await client.getPlayer("TestUser");
  assert.equal(player.playerId, "testuser");
  assert.deepEqual(player.ratings.map(({ speed, value, provisional }) => ({
    speed,
    value,
    provisional
  })), [
    { speed: "blitz", value: 1810, provisional: true },
    { speed: "rapid", value: 1900, provisional: false }
  ]);
});
