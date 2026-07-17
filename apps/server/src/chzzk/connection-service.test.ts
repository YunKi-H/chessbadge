import assert from "node:assert/strict";
import test from "node:test";
import type { ChzzkAuthConfig } from "../auth/chzzk/client.js";
import { ChzzkConnectionService } from "./connection-service.js";

const config: ChzzkAuthConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost/callback",
  openApiBaseUrl: "https://openapi.example.com"
};

test("disconnect revokes remotely before deleting stored tokens", async () => {
  const operations: string[] = [];
  const service = new ChzzkConnectionService({
    loadTokens: async () => ({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      expiresAt: new Date("2026-07-18T00:00:00.000Z"),
      scope: "chat"
    }),
    stopSession: async () => {
      operations.push("stop");
      return true;
    },
    revokeToken: async (_config, token, hint) => {
      operations.push(`revoke:${token}:${hint}`);
    },
    deleteTokens: async () => {
      operations.push("delete");
    }
  });

  assert.deepEqual(await service.disconnect("chzzk:user", config), {
    revoked: true
  });
  assert.deepEqual(operations, [
    "stop",
    "revoke:refresh-token:refresh_token",
    "delete"
  ]);
});

test("disconnect preserves stored tokens when remote revocation fails", async () => {
  const operations: string[] = [];
  const service = new ChzzkConnectionService({
    loadTokens: async () => ({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      tokenType: "Bearer",
      expiresAt: new Date("2026-07-18T00:00:00.000Z"),
      scope: null
    }),
    stopSession: async () => {
      operations.push("stop");
      return true;
    },
    revokeToken: async () => {
      operations.push("revoke");
      throw new Error("revoke failed");
    },
    deleteTokens: async () => {
      operations.push("delete");
    }
  });

  await assert.rejects(service.disconnect("chzzk:user", config));
  assert.deepEqual(operations, ["stop", "revoke"]);
});

test("disconnect stops the session when stored tokens cannot be loaded", async () => {
  const operations: string[] = [];
  const service = new ChzzkConnectionService({
    loadTokens: async () => {
      operations.push("load");
      throw new Error("decrypt failed");
    },
    stopSession: async () => {
      operations.push("stop");
      return true;
    },
    revokeToken: async () => {
      operations.push("revoke");
    },
    deleteTokens: async () => {
      operations.push("delete");
    }
  });

  await assert.rejects(service.disconnect("chzzk:user", config));
  assert.deepEqual(operations, ["load", "stop"]);
});

test("disconnect is idempotent when no stored token exists", async () => {
  let stopped = false;
  const service = new ChzzkConnectionService({
    loadTokens: async () => null,
    stopSession: async () => {
      stopped = true;
      return false;
    },
    revokeToken: async () => {},
    deleteTokens: async () => {}
  });

  assert.deepEqual(await service.disconnect("chzzk:user", config), {
    revoked: false
  });
  assert.equal(stopped, false);
});
