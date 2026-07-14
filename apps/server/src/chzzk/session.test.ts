import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyBaseLogger } from "fastify";
import type { ChzzkAuthConfig } from "../auth/chzzk/client.js";
import {
  ChzzkSessionManager,
  type ChzzkSessionStatus
} from "./session.js";

const config: ChzzkAuthConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost/callback",
  openApiBaseUrl: "https://openapi.example.com"
};

const logger = {} as FastifyBaseLogger;

class FakeSession {
  stopped = false;
  accessToken: string | null = null;

  constructor(private readonly failStart = false) {}

  async start(
    _config: ChzzkAuthConfig,
    accessToken: string,
    _logger: FastifyBaseLogger
  ): Promise<ChzzkSessionStatus> {
    if (this.failStart) {
      throw new Error("start failed");
    }

    this.accessToken = accessToken;
    return status();
  }

  stop() {
    this.stopped = true;
  }

  getStatus() {
    return status();
  }

  updateAccessToken(accessToken: string) {
    this.accessToken = accessToken;
  }
}

test("different streamers keep independent Chzzk sessions", async () => {
  const sessions = new Map<string, FakeSession[]>();
  const manager = new ChzzkSessionManager((uid) => {
    const session = new FakeSession();
    sessions.set(uid, [...(sessions.get(uid) ?? []), session]);
    return session;
  });

  await manager.start("streamer-a", config, "token-a", logger);
  await manager.start("streamer-b", config, "token-b", logger);

  assert.equal(manager.getActiveSessionCount(), 2);
  assert.equal(sessions.get("streamer-a")?.[0]?.stopped, false);
  assert.equal(sessions.get("streamer-b")?.[0]?.stopped, false);
});

test("restarting a streamer replaces only that streamer's session", async () => {
  const sessions = new Map<string, FakeSession[]>();
  const manager = new ChzzkSessionManager((uid) => {
    const session = new FakeSession();
    sessions.set(uid, [...(sessions.get(uid) ?? []), session]);
    return session;
  });

  await manager.start("streamer-a", config, "old-token", logger);
  await manager.start("streamer-b", config, "token-b", logger);
  await manager.start("streamer-a", config, "new-token", logger);

  assert.equal(sessions.get("streamer-a")?.[0]?.stopped, true);
  assert.equal(sessions.get("streamer-a")?.[1]?.accessToken, "new-token");
  assert.equal(sessions.get("streamer-b")?.[0]?.stopped, false);
  assert.equal(manager.getActiveSessionCount(), 2);
});

test("stop and token updates are scoped to one streamer", async () => {
  const sessions = new Map<string, FakeSession>();
  const manager = new ChzzkSessionManager((uid) => {
    const session = new FakeSession();
    sessions.set(uid, session);
    return session;
  });

  await manager.start("streamer-a", config, "token-a", logger);
  await manager.start("streamer-b", config, "token-b", logger);

  assert.equal(manager.updateAccessToken("streamer-a", "refreshed-a"), true);
  assert.equal(sessions.get("streamer-a")?.accessToken, "refreshed-a");
  assert.equal(sessions.get("streamer-b")?.accessToken, "token-b");

  assert.equal(manager.stop("streamer-a"), true);
  assert.equal(manager.getStatus("streamer-a"), null);
  assert.notEqual(manager.getStatus("streamer-b"), null);
  assert.equal(manager.getActiveSessionCount(), 1);
});

test("a failed start removes only the failed streamer's session", async () => {
  const manager = new ChzzkSessionManager(
    (uid) => new FakeSession(uid === "streamer-b")
  );

  await manager.start("streamer-a", config, "token-a", logger);
  await assert.rejects(
    manager.start("streamer-b", config, "token-b", logger),
    /start failed/
  );

  assert.notEqual(manager.getStatus("streamer-a"), null);
  assert.equal(manager.getStatus("streamer-b"), null);
  assert.equal(manager.getActiveSessionCount(), 1);
});

function status(): ChzzkSessionStatus {
  return {
    health: "healthy_idle",
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
