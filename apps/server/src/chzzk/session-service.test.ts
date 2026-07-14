import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyBaseLogger } from "fastify";
import type { ChzzkAuthConfig } from "../auth/chzzk/client.js";
import { ChzzkSessionService } from "./session-service.js";

const config: ChzzkAuthConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost/callback",
  openApiBaseUrl: "https://openapi.example.com"
};

const logger = {
  info() {},
  warn() {},
  error() {}
} as unknown as FastifyBaseLogger;

test("startup recovery restores each enabled streamer independently", async () => {
  const started: string[] = [];
  const refreshStarted: string[] = [];
  const service = new ChzzkSessionService({
    listRestorableUids: async () => ["streamer-a", "streamer-b"],
    getSessionIntent: async () => ({ enabled: true, tokenStatus: "active" }),
    setSessionEnabled: async () => {},
    getValidAccessToken: async (uid) => `token-${uid}`,
    startSession: async (uid, _config, accessToken) => {
      started.push(`${uid}:${accessToken}`);
      return status();
    },
    stopSession: () => true,
    getSessionStatus: () => status(),
    startTokenRefresh: async (uid) => {
      refreshStarted.push(uid);
    },
    stopTokenRefresh: () => {}
  });

  await service.restoreEnabledSessions(config, logger);

  assert.deepEqual(started.sort(), [
    "streamer-a:token-streamer-a",
    "streamer-b:token-streamer-b"
  ]);
  assert.deepEqual(refreshStarted.sort(), ["streamer-a", "streamer-b"]);
});

test("startup recovery skips a streamer whose intent changed", async () => {
  let intentReadCount = 0;
  let started = false;
  const service = new ChzzkSessionService({
    listRestorableUids: async () => ["streamer-a"],
    getSessionIntent: async () => {
      intentReadCount += 1;
      return {
        enabled: intentReadCount === 1,
        tokenStatus: "active" as const
      };
    },
    setSessionEnabled: async () => {},
    getValidAccessToken: async () => "token-a",
    startSession: async () => {
      started = true;
      return status();
    },
    stopSession: () => true,
    getSessionStatus: () => null,
    startTokenRefresh: async () => {},
    stopTokenRefresh: () => {}
  });

  await service.restoreEnabledSessions(config, logger);

  assert.equal(started, false);
});

test("manual stop is serialized after an in-progress restore", async () => {
  const operations: string[] = [];
  let releaseTokenLookup: (() => void) | undefined;
  const tokenLookupBlocked = new Promise<void>((resolve) => {
    releaseTokenLookup = resolve;
  });
  const service = new ChzzkSessionService({
    listRestorableUids: async () => ["streamer-a"],
    getSessionIntent: async () => ({ enabled: true, tokenStatus: "active" }),
    setSessionEnabled: async (_uid, enabled) => {
      operations.push(`enabled:${enabled}`);
    },
    getValidAccessToken: async () => {
      operations.push("token:started");
      await tokenLookupBlocked;
      return "token-a";
    },
    startSession: async () => {
      operations.push("session:started");
      return status();
    },
    stopSession: () => {
      operations.push("session:stopped");
      return true;
    },
    getSessionStatus: () => null,
    startTokenRefresh: async () => {
      operations.push("refresh:started");
    },
    stopTokenRefresh: () => {
      operations.push("refresh:stopped");
    }
  });

  const recovery = service.restoreEnabledSessions(config, logger);
  await waitFor(() => operations.includes("token:started"));
  const stop = service.stop("streamer-a");
  releaseTokenLookup?.();

  await Promise.all([recovery, stop]);

  assert.deepEqual(operations, [
    "token:started",
    "session:started",
    "refresh:started",
    "enabled:false",
    "refresh:stopped",
    "session:stopped"
  ]);
});

function status() {
  return {
    health: "healthy_idle" as const,
    connected: true,
    sessionKey: "session-key",
    subscribed: true,
    startedAt: "2026-07-14T00:00:00.000Z",
    lastChatAt: null,
    lastHealthCheckAt: "2026-07-14T00:00:00.000Z",
    lastHealthyAt: "2026-07-14T00:00:00.000Z",
    reconnectAttempt: 0,
    lastError: null
  };
}

async function waitFor(predicate: () => boolean) {
  while (!predicate()) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
