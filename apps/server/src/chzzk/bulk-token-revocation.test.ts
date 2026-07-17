import assert from "node:assert/strict";
import test from "node:test";
import type { ChzzkAuthConfig } from "../auth/chzzk/client.js";
import { revokeAllChzzkStreamerTokens } from "./bulk-token-revocation.js";

const config: ChzzkAuthConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://example.com/callback",
  openApiBaseUrl: "https://openapi.example.com"
};

test("revokes each stored token before deleting it", async () => {
  const operations: string[] = [];
  const result = await revokeAllChzzkStreamerTokens(config, {
    listUids: async () => ["first", "second"],
    loadTokens: async (uid) => ({
      accessToken: `${uid}-access`,
      refreshToken: `${uid}-refresh`,
      tokenType: "Bearer",
      expiresAt: new Date(),
      scope: null
    }),
    revokeToken: async (_config, token, hint) => {
      operations.push(`revoke:${token}:${hint}`);
    },
    deleteTokens: async (uid) => {
      operations.push(`delete:${uid}`);
    }
  });

  assert.deepEqual(operations, [
    "revoke:first-refresh:refresh_token",
    "delete:first",
    "revoke:second-refresh:refresh_token",
    "delete:second"
  ]);
  assert.deepEqual(result.revoked, ["first", "second"]);
  assert.deepEqual(result.failures, []);
});

test("keeps local tokens when remote revocation fails", async () => {
  const deleted: string[] = [];
  const result = await revokeAllChzzkStreamerTokens(config, {
    listUids: async () => ["broken", "missing"],
    loadTokens: async (uid) =>
      uid === "missing"
        ? null
        : {
            accessToken: "access",
            refreshToken: "refresh",
            tokenType: "Bearer",
            expiresAt: new Date(),
            scope: null
          },
    revokeToken: async () => {
      throw new Error("revoke failed");
    },
    deleteTokens: async (uid) => {
      deleted.push(uid);
    }
  });

  assert.deepEqual(deleted, []);
  assert.deepEqual(result.skipped, ["missing"]);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0]?.uid, "broken");
});
