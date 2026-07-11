import socketIoClient from "socket.io-client";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import type { ChzzkAuthConfig } from "../auth/chzzk/client.js";
import {
  createChzzkUserSession,
  subscribeChzzkChatEvent
} from "../auth/chzzk/client.js";

interface ChzzkSocket {
  on(event: string, listener: (...args: unknown[]) => void): void;
  disconnect(): void;
  onevent?: (packet: SocketIoPacket) => void;
}

interface SocketIoPacket {
  data?: unknown[];
}

const systemMessageSchema = z.object({
  type: z.string(),
  data: z.record(z.unknown()).optional()
});

const chatMessageSchema = z.object({
  channelId: z.string(),
  senderChannelId: z.string(),
  profile: z.object({
    nickname: z.string(),
    badges: z.array(z.unknown()).optional(),
    verifiedMark: z.boolean().optional(),
    userRoleCode: z.string().optional()
  }),
  content: z.string(),
  emojis: z.record(z.string()).optional(),
  messageTime: z.number()
});

export interface ChzzkSessionStatus {
  connected: boolean;
  sessionKey: string | null;
  subscribed: boolean;
  startedAt: string | null;
  lastChatAt: string | null;
  lastError: string | null;
}

class ChzzkSessionManager {
  private socket: ChzzkSocket | null = null;
  private accessToken: string | null = null;
  private config: ChzzkAuthConfig | null = null;
  private logger: FastifyBaseLogger | null = null;
  private status: ChzzkSessionStatus = {
    connected: false,
    sessionKey: null,
    subscribed: false,
    startedAt: null,
    lastChatAt: null,
    lastError: null
  };

  async start(config: ChzzkAuthConfig, accessToken: string, logger: FastifyBaseLogger) {
    this.stop();

    this.config = config;
    this.accessToken = accessToken;
    this.logger = logger;
    this.status = {
      connected: false,
      sessionKey: null,
      subscribed: false,
      startedAt: new Date().toISOString(),
      lastChatAt: null,
      lastError: null
    };

    const session = await createChzzkUserSession(config, accessToken);

    logger.info({ sessionUrl: redactSessionUrl(session.url) }, "Chzzk session URL created");

    this.socket = socketIoClient(session.url, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    attachRawEventLogger(this.socket, logger);

    this.socket.on("connect", () => {
      this.status.connected = true;
      logger.info("Chzzk socket connected");
    });

    this.socket.on("disconnect", (reason: unknown) => {
      this.status.connected = false;
      logger.warn({ reason: String(reason) }, "Chzzk socket disconnected");
    });

    this.socket.on("connect_error", (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.status.lastError = message;
      logger.error({ err: error }, "Chzzk socket connection error");
    });

    this.socket.on("SYSTEM", (message: unknown) => {
      void this.handleSystemMessage(message);
    });

    this.socket.on("system", (message: unknown) => {
      void this.handleSystemMessage(message);
    });

    this.socket.on("CHAT", (message: unknown) => {
      this.handleChatMessage(message);
    });

    this.socket.on("chat", (message: unknown) => {
      this.handleChatMessage(message);
    });

    return this.getStatus();
  }

  stop() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.status.connected = false;
    this.status.subscribed = false;
    this.status.sessionKey = null;
  }

  getStatus() {
    return { ...this.status };
  }

  private async handleSystemMessage(message: unknown) {
    const normalizedMessage = normalizeSocketPayload(message);
    const parsed = systemMessageSchema.safeParse(normalizedMessage);

    if (!parsed.success) {
      this.logger?.warn({ message: normalizedMessage }, "Unknown Chzzk SYSTEM message");
      return;
    }

    this.logger?.info({ system: parsed.data }, "Chzzk SYSTEM message received");

    if (parsed.data.type !== "connected") {
      if (parsed.data.type === "subscribed") {
        this.status.subscribed = true;
      }

      return;
    }

    const sessionKey = parsed.data.data?.sessionKey;

    if (typeof sessionKey !== "string") {
      this.status.lastError = "Connected SYSTEM message did not include sessionKey";
      this.logger?.error({ message }, this.status.lastError);
      return;
    }

    this.status.sessionKey = sessionKey;

    if (!this.config || !this.accessToken) {
      this.status.lastError = "Chzzk session config was not available";
      this.logger?.error(this.status.lastError);
      return;
    }

    try {
      await subscribeChzzkChatEvent(this.config, this.accessToken, sessionKey);
      this.status.subscribed = true;
      this.logger?.info({ sessionKey }, "Chzzk CHAT event subscribed");
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      this.status.lastError = messageText;
      this.logger?.error({ err: error }, "Chzzk CHAT event subscription failed");
    }
  }

  private handleChatMessage(message: unknown) {
    const normalizedMessage = normalizeSocketPayload(message);
    const parsed = chatMessageSchema.safeParse(normalizedMessage);

    if (!parsed.success) {
      this.logger?.warn({ message: normalizedMessage }, "Unknown Chzzk CHAT message");
      return;
    }

    this.status.lastChatAt = new Date().toISOString();

    this.logger?.info(
      {
        channelId: parsed.data.channelId,
        senderChannelId: parsed.data.senderChannelId,
        nickname: parsed.data.profile.nickname,
        content: parsed.data.content,
        messageTime: parsed.data.messageTime
      },
      "Chzzk chat message received"
    );
  }
}

export const chzzkSessionManager = new ChzzkSessionManager();

function attachRawEventLogger(socket: ChzzkSocket, logger: FastifyBaseLogger) {
  const originalOnevent = socket.onevent;

  if (!originalOnevent) {
    logger.warn("Chzzk socket raw event logger could not be attached");
    return;
  }

  socket.onevent = function onevent(packet: SocketIoPacket) {
    const [eventName, payload] = packet.data ?? [];

    logger.debug(
      {
        eventName,
        payload: normalizeSocketPayload(payload)
      },
      "Chzzk raw socket event received"
    );

    originalOnevent.call(this, packet);
  };
}

function normalizeSocketPayload(payload: unknown): unknown {
  if (typeof payload !== "string") {
    return payload;
  }

  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

function redactSessionUrl(url: string) {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}
