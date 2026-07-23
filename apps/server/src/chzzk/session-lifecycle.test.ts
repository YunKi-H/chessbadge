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
import { subscribeStreamerChatOverlayEvents } from "../realtime/overlay-events.js";

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

test("published chat includes the sender's cached rating badge", async () => {
  const sockets: FakeSocket[] = [];
  const deps = dependencies(sockets, () => {});
  const infoLogs: Array<{ context: unknown; message?: string }> = [];
  const warnLogs: Array<{ context: unknown; message?: string }> = [];
  const diagnosticLogger = {
    info(context: unknown, message?: string) {
      infoLogs.push({ context, message });
    },
    warn(context: unknown, message?: string) {
      warnLogs.push({ context, message });
    },
    error() {},
    debug() {}
  } as unknown as FastifyBaseLogger;
  deps.getRatingBadge = async (channelId) => ({
    badges: {
      chesscom: {
        provider: "chesscom",
        speed: "rapid",
        value: channelId === "viewer-channel" ? 1520 : 0,
        provisional: false
      }
    },
    preferredProvider: "chesscom"
  });
  const session = new ChzzkSession("streamer-a", policy, deps);
  const events: Array<{
    ratings: { chesscom?: { value: number } };
    preferredChessProvider: string | null;
    chzzkBadges?: Array<{ kind: string; imageUrl: string }>;
    emojis: Array<{ token: string; imageUrl: string }>;
    authorKind: string;
  }> = [];
  const unsubscribe = subscribeStreamerChatOverlayEvents("streamer-a", (event) => {
    events.push(event);
  });

  await session.start(config, "access-token", diagnosticLogger);
  sockets[0]?.emit("CHAT", {
    channelId: "streamer-channel",
    senderChannelId: "viewer-channel",
    profile: {
      nickname: "viewer",
      badges: [{ badgeType: "subscription", imageUrl: "https://example.com/badge.png" }],
      verifiedMark: true,
      userRoleCode: "common_user"
    },
    content: "good move",
    emojis: {
      brilliant: "https://example.com/brilliant.png",
      ":checkmate:": "https://example.com/checkmate.png"
    },
    messageTime: 1_783_000_000_000
  });
  await waitFor(() => events.length === 1);

  assert.equal(events[0]?.ratings?.chesscom?.value, 1520);
  assert.equal(events[0]?.preferredChessProvider, "chesscom");
  assert.deepEqual(events[0]?.chzzkBadges, [
    { kind: "subscription", imageUrl: "https://example.com/badge.png" }
  ]);
  assert.equal(events[0]?.authorKind, "subscriber");
  assert.deepEqual(events[0]?.emojis, [
    {
      token: "{:brilliant:}",
      imageUrl: "https://example.com/brilliant.png"
    },
    {
      token: "{:checkmate:}",
      imageUrl: "https://example.com/checkmate.png"
    }
  ]);

  const chatLog = infoLogs.find(
    ({ message }) => message === "Chzzk chat message received"
  );
  assert.deepEqual(chatLog?.context, {
    channelId: "streamer-channel",
    authorKind: "subscriber",
    contentLength: 9,
    badgeCount: 1,
    emojiCount: 2,
    messageTime: 1_783_000_000_000
  });
  assert.equal(JSON.stringify(chatLog).includes("viewer-channel"), false);
  assert.equal(JSON.stringify(chatLog).includes("viewer"), false);
  assert.equal(JSON.stringify(chatLog).includes("good move"), false);

  sockets[0]?.emit("CHAT", {
    nickname: "private-nickname",
    content: "private-message"
  });
  const invalidChatLog = warnLogs.find(
    ({ message }) => message === "Unknown Chzzk CHAT message"
  );
  assert.equal(JSON.stringify(invalidChatLog).includes("private-nickname"), false);
  assert.equal(JSON.stringify(invalidChatLog).includes("private-message"), false);
  unsubscribe();
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
    getRatingBadge: async () => ({ badges: {}, preferredProvider: null }),
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
