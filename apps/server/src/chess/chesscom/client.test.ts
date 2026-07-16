import assert from "node:assert/strict";
import test from "node:test";
import { ChessComClientError, createChessComClient } from "./client.js";

test("loads a Chess.com profile and supported live ratings", async () => {
  const requestedPaths: string[] = [];
  const client = createChessComClient({
    userAgent: "EloBadge test@example.com",
    fetch: async (input) => {
      const url = new URL(input.toString());
      requestedPaths.push(url.pathname);

      return Response.json(
        url.pathname.endsWith("/stats")
          ? {
              chess_bullet: { last: { rating: 1400, date: 100, rd: 45 } },
              chess_blitz: { last: { rating: 1500, date: 200, rd: 55 } },
              chess_rapid: { last: { rating: 1600, date: 300, rd: 65 } },
              chess_daily: { last: { rating: 1700, date: 400, rd: 75 } }
            }
          : {
              username: "Test-User",
              player_id: 42,
              status: "premium",
              location: "elobadge-example",
              url: "https://www.chess.com/member/test-user"
            }
      );
    }
  });

  const player = await client.getPlayer(" Test-User ");

  assert.deepEqual(requestedPaths, [
    "/pub/player/test-user",
    "/pub/player/test-user/stats"
  ]);
  assert.equal(player.username, "Test-User");
  assert.equal(player.normalizedUsername, "test-user");
  assert.equal(player.playerId, "42");
  assert.equal(player.location, "elobadge-example");
  assert.deepEqual(
    player.ratings.map(({ speed, value }) => ({ speed, value })),
    [
      { speed: "bullet", value: 1400 },
      { speed: "blitz", value: 1500 },
      { speed: "rapid", value: 1600 }
    ]
  );
});

test("maps a missing Chess.com account to a typed error", async () => {
  const client = createChessComClient({
    userAgent: "EloBadge test@example.com",
    fetch: async () => new Response(null, { status: 404 })
  });

  await assert.rejects(
    client.getPlayer("missing-user"),
    (error: unknown) =>
      error instanceof ChessComClientError && error.code === "not_found"
  );
});

test("serializes PubAPI requests across concurrent player lookups", async () => {
  let activeRequests = 0;
  let maximumActiveRequests = 0;
  const client = createChessComClient({
    userAgent: "EloBadge test@example.com",
    fetch: async (input) => {
      activeRequests += 1;
      maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeRequests -= 1;

      return Response.json(
        input.toString().endsWith("/stats")
          ? {}
          : {
              username: "user",
              player_id: 1,
              status: "basic",
              url: "https://www.chess.com/member/user"
            }
      );
    }
  });

  await Promise.all([client.getPlayer("one"), client.getPlayer("two")]);

  assert.equal(maximumActiveRequests, 1);
});
