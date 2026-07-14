import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyBaseLogger } from "fastify";
import type { ChzzkAuthConfig } from "../auth/chzzk/client.js";
import {
  ChzzkSession,
  type ChzzkSessionDependencies,
  type ChzzkSocket
} from "./session.js";
import type { ChzzkSessionPolicy } from "./session-watchdog.js";

const config: ChzzkAuthConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost/callback",
  openApiBaseUrl: "https://openapi.example.com"
};

const logger = {
  info() {},
  warn() {},
  error() {},
  debug() {}
} as unknown as FastifyBaseLogger;

const policy: ChzzkSessionPolicy = {
  connectionTimeoutMs: 20,
  subscriptionTimeoutMs: 20,
  healthCheckIntervalMs: 1_000,
  invalidHealthCheckThreshold: 2,
  reconnectBaseDelayMs: 1,
  reconnectMaxDelayMs: 4,
  activeChatWindowMs: 100
};

class FakeSocket implements ChzzkSocket {
  private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  on(event: string, listener: (...args: unknown[]) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }

  disconnect(): void {}

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

test("socket disconnect creates a fresh Chzzk session with backoff", async () => {
  const sockets: FakeSocket[] = [];
  let sessionRequests = 0;
  const session = new ChzzkSession(
    "streamer-a",
    policy,
    dependencies(sockets, () => {
      sessionRequests += 1;
    })
  );

  await session.start(config, "access-token", logger);
  sockets[0]?.emit("connect");
  sockets[0]?.emit("SYSTEM", {
    type: "connected",
    data: { sessionKey: "session-1" }
  });
  await nextTask();
  sockets[0]?.emit("SYSTEM", {
    type: "subscribed",
    data: { eventType: "CHAT", channelId: "channel-1" }
  });

  assert.equal(session.getStatus().health, "healthy_idle");
  sockets[0]?.emit("disconnect", "transport close");
  await waitFor(() => sessionRequests === 2);

  assert.equal(sockets.length, 2);
  assert.equal(session.getStatus().health, "reconnecting");
  session.stop();
});

test("missing sessionKey before the deadline creates a fresh session", async () => {
  const sockets: FakeSocket[] = [];
  let sessionRequests = 0;
  const session = new ChzzkSession(
    "streamer-a",
    policy,
    dependencies(sockets, () => {
      sessionRequests += 1;
    })
  );

  await session.start(config, "access-token", logger);
  sockets[0]?.emit("connect");
  await waitFor(() => sessionRequests === 2, 200);

  assert.equal(sockets.length, 2);
  assert.equal(session.getStatus().reconnectAttempt, 1);
  session.stop();
});

function dependencies(
  sockets: FakeSocket[],
  onSessionRequest: () => void
): ChzzkSessionDependencies {
  return {
    createUserSession: async () => {
      onSessionRequest();
      return { url: `https://session.example.com/${sockets.length}` };
    },
    getUserSessions: async () => [],
    subscribeChat: async () => ({}),
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    random: () => 0.5
  };
}

async function nextTask() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitFor(predicate: () => boolean, timeoutMs = 100) {
  const deadline = Date.now() + timeoutMs;

  while (!predicate()) {
    if (Date.now() >= deadline) {
      assert.fail("condition was not met before timeout");
    }

    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
