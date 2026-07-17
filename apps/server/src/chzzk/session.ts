import socketIoClient from "socket.io-client";
import { z } from "zod";
import type { FastifyBaseLogger } from "fastify";
import type {
  ChatOverlayEvent,
  ChzzkBadge,
  ChzzkEmoji,
  RatingBadge
} from "@elobadge/core";
import type { ChzzkAuthConfig } from "../auth/chzzk/client.js";
import {
  createChzzkUserSession,
  getChzzkUserSessions,
  subscribeChzzkChatEvent
} from "../auth/chzzk/client.js";
import { markChzzkStreamerReauthenticationRequired } from "../firebase/chzzk-tokens.js";
import { publishChatOverlayEvent } from "../realtime/overlay-events.js";
import { ratingBadgeCache } from "../chess/badge-cache.js";
import { classifyChzzkChatAuthor } from "./chat-author.js";
import { chzzkBadgeDiagnostics } from "./badge-diagnostics.js";
import {
  defaultChzzkSessionPolicy,
  getChzzkReconnectDelay,
  getHealthyChzzkSessionState,
  isChzzkSessionControlPlaneHealthy,
  type ChzzkSessionHealth,
  type ChzzkSessionPolicy
} from "./session-watchdog.js";

export interface ChzzkSocket {
  on(event: string, listener: (...args: unknown[]) => void): void;
  disconnect(): void;
  onevent?: (packet: SocketIoPacket) => void;
}

export interface ChzzkSessionDependencies {
  createUserSession: typeof createChzzkUserSession;
  getUserSessions: typeof getChzzkUserSessions;
  subscribeChat: typeof subscribeChzzkChatEvent;
  createSocket(url: string): ChzzkSocket;
  getRatingBadge(senderChannelId: string): Promise<RatingBadge | null>;
  random(): number;
}

const defaultSessionDependencies: ChzzkSessionDependencies = {
  createUserSession: createChzzkUserSession,
  getUserSessions: getChzzkUserSessions,
  subscribeChat: subscribeChzzkChatEvent,
  createSocket: (url) =>
    socketIoClient(url, {
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
      timeout: 3000
    }),
  getRatingBadge: (senderChannelId) => ratingBadgeCache.get(senderChannelId),
  random: Math.random
};

interface SocketIoPacket {
  data?: unknown[];
}

const MAX_CHZZK_BADGES_PER_MESSAGE = 10;
const MAX_CHZZK_EMOJIS_PER_MESSAGE = 50;

const systemMessageSchema = z.object({
  type: z.string(),
  data: z.record(z.string(), z.unknown()).optional()
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
  emojis: z.record(z.string(), z.string()).optional(),
  messageTime: z.number()
});

export interface ChzzkSessionStatus {
  health: ChzzkSessionHealth;
  connected: boolean;
  sessionKey: string | null;
  subscribed: boolean;
  startedAt: string | null;
  lastChatAt: string | null;
  lastHealthCheckAt: string | null;
  lastHealthyAt: string | null;
  reconnectAttempt: number;
  lastError: string | null;
}

interface ManagedChzzkSession {
  start(
    config: ChzzkAuthConfig,
    accessToken: string,
    logger: FastifyBaseLogger
  ): Promise<ChzzkSessionStatus>;
  stop(): void;
  getStatus(): ChzzkSessionStatus;
  updateAccessToken(accessToken: string): void;
}

export class ChzzkSession implements ManagedChzzkSession {
  private socket: ChzzkSocket | null = null;
  private accessToken: string | null = null;
  private config: ChzzkAuthConfig | null = null;
  private logger: FastifyBaseLogger | null = null;
  private active = false;
  private generation = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionDeadline: NodeJS.Timeout | null = null;
  private subscriptionDeadline: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private healthCheckInFlight = false;
  private invalidHealthChecks = 0;
  private status: ChzzkSessionStatus = {
    health: "connecting",
    connected: false,
    sessionKey: null,
    subscribed: false,
    startedAt: null,
    lastChatAt: null,
    lastHealthCheckAt: null,
    lastHealthyAt: null,
    reconnectAttempt: 0,
    lastError: null
  };

  constructor(
    private readonly ownerUid: string,
    private readonly policy: ChzzkSessionPolicy = defaultChzzkSessionPolicy,
    private readonly dependencies: ChzzkSessionDependencies = defaultSessionDependencies
  ) {}

  async start(
    config: ChzzkAuthConfig,
    accessToken: string,
    logger: FastifyBaseLogger
  ): Promise<ChzzkSessionStatus> {
    this.stop();

    this.active = true;
    this.config = config;
    this.accessToken = accessToken;
    this.logger = logger;
    this.status = {
      health: "connecting",
      connected: false,
      sessionKey: null,
      subscribed: false,
      startedAt: new Date().toISOString(),
      lastChatAt: null,
      lastHealthCheckAt: null,
      lastHealthyAt: null,
      reconnectAttempt: 0,
      lastError: null
    };

    await this.connectFreshSession(true);

    return this.getStatus();
  }

  stop(): void {
    this.active = false;
    this.generation += 1;
    this.clearReconnectTimer();
    this.clearConnectionResources();

    this.status.connected = false;
    this.status.subscribed = false;
    this.status.sessionKey = null;
    this.accessToken = null;
    this.config = null;
    this.logger = null;
  }

  getStatus(): ChzzkSessionStatus {
    return { ...this.status };
  }

  updateAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
  }

  private async connectFreshSession(initialConnection: boolean): Promise<void> {
    if (!this.active || !this.config || !this.accessToken || !this.logger) {
      throw new Error(`Chzzk session config was not available for ${this.ownerUid}`);
    }

    const generation = ++this.generation;
    const config = this.config;
    const accessToken = this.accessToken;
    const logger = this.logger;

    this.clearConnectionResources();
    this.status.health = initialConnection ? "connecting" : "reconnecting";
    this.status.connected = false;
    this.status.sessionKey = null;
    this.status.subscribed = false;

    let session;

    try {
      session = await this.dependencies.createUserSession(config, accessToken);
    } catch (error) {
      this.status.health = "connection_failed";
      this.status.lastError = errorMessage(error);

      if (initialConnection) {
        throw error;
      }

      this.scheduleReconnect("Chzzk session URL request failed");
      return;
    }

    if (!this.isCurrent(generation)) {
      if (initialConnection && !this.active) {
        throw new Error(`Chzzk session start was cancelled for ${this.ownerUid}`);
      }

      return;
    }

    logger.info(
      { ownerUid: this.ownerUid, sessionUrl: redactSessionUrl(session.url) },
      "Chzzk session URL created"
    );

    const socket = this.dependencies.createSocket(session.url);
    this.socket = socket;
    attachRawEventLogger(socket, logger);
    this.startConnectionDeadline(generation);

    socket.on("connect", () => {
      if (!this.isCurrent(generation)) {
        return;
      }

      this.status.connected = true;
      this.status.health = "connecting";
      logger.info({ ownerUid: this.ownerUid }, "Chzzk socket connected");
    });

    socket.on("disconnect", (reason: unknown) => {
      if (!this.isCurrent(generation)) {
        return;
      }

      logger.warn(
        { ownerUid: this.ownerUid, reason: String(reason) },
        "Chzzk socket disconnected"
      );
      this.scheduleReconnect(`Socket disconnected: ${String(reason)}`);
    });

    socket.on("connect_error", (error: unknown) => {
      if (!this.isCurrent(generation)) {
        return;
      }

      this.status.health = "connection_failed";
      this.status.lastError = errorMessage(error);
      logger.error({ err: error, ownerUid: this.ownerUid }, "Chzzk socket connection error");
      this.scheduleReconnect("Socket connection failed");
    });

    socket.on("SYSTEM", (message: unknown) => {
      void this.handleSystemMessage(message, generation);
    });

    socket.on("system", (message: unknown) => {
      void this.handleSystemMessage(message, generation);
    });

    socket.on("CHAT", (message: unknown) => {
      this.handleChatMessage(message, generation);
    });

    socket.on("chat", (message: unknown) => {
      this.handleChatMessage(message, generation);
    });
  }

  private async handleSystemMessage(message: unknown, generation: number) {
    if (!this.isCurrent(generation)) {
      return;
    }

    const normalizedMessage = normalizeSocketPayload(message);
    const parsed = systemMessageSchema.safeParse(normalizedMessage);

    if (!parsed.success) {
      this.logger?.warn({ message: normalizedMessage }, "Unknown Chzzk SYSTEM message");
      return;
    }

    this.logger?.info({ system: parsed.data }, "Chzzk SYSTEM message received");

    if (parsed.data.type === "subscribed") {
      if (parsed.data.data?.eventType === "CHAT") {
        this.markSubscribed(generation);
      }
      return;
    }

    if (parsed.data.type === "unsubscribed") {
      if (parsed.data.data?.eventType === "CHAT") {
        this.scheduleReconnect("CHAT subscription was removed");
      }
      return;
    }

    if (parsed.data.type === "revoked") {
      if (parsed.data.data?.eventType === "CHAT") {
        this.clearWatchdogTimers();
        this.status.subscribed = false;
        this.status.health = "subscription_failed";
        this.status.lastError = "Chzzk CHAT permission was revoked";
        void markChzzkStreamerReauthenticationRequired(this.ownerUid).catch(
          (error: unknown) => {
            this.logger?.error(
              { err: error, ownerUid: this.ownerUid },
              "Could not persist Chzzk reauthentication requirement"
            );
          }
        );
      }
      return;
    }

    if (parsed.data.type !== "connected") {
      return;
    }

    const sessionKey = parsed.data.data?.sessionKey;

    if (typeof sessionKey !== "string") {
      this.status.lastError = "Connected SYSTEM message did not include sessionKey";
      this.logger?.error({ message }, this.status.lastError);
      return;
    }

    this.clearTimer("connectionDeadline");
    this.status.sessionKey = sessionKey;

    if (!this.config || !this.accessToken) {
      this.status.lastError = "Chzzk session config was not available";
      this.logger?.error(this.status.lastError);
      return;
    }

    this.startSubscriptionDeadline(generation);

    try {
      await this.dependencies.subscribeChat(this.config, this.accessToken, sessionKey);
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return;
      }

      this.status.health = "subscription_failed";
      this.status.lastError = errorMessage(error);
      this.logger?.error({ err: error }, "Chzzk CHAT event subscription failed");
      this.scheduleReconnect("CHAT subscription request failed");
    }
  }

  private handleChatMessage(message: unknown, generation: number) {
    if (!this.isCurrent(generation)) {
      return;
    }

    const normalizedMessage = normalizeSocketPayload(message);
    const parsed = chatMessageSchema.safeParse(normalizedMessage);

    if (!parsed.success) {
      this.logger?.warn({ message: normalizedMessage }, "Unknown Chzzk CHAT message");
      return;
    }

    this.status.lastChatAt = new Date().toISOString();
    this.status.health = "healthy_active";

    if (this.logger) {
      chzzkBadgeDiagnostics.record(parsed.data.profile, this.logger);
    }

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

    void this.publishChatMessage(parsed.data, generation);
  }

  private async publishChatMessage(
    message: z.infer<typeof chatMessageSchema>,
    generation: number
  ): Promise<void> {
    let rating: RatingBadge | null = null;

    try {
      rating = await this.dependencies.getRatingBadge(message.senderChannelId);
    } catch (error) {
      this.logger?.warn(
        { err: error, senderChannelId: message.senderChannelId },
        "Chess rating badge lookup failed"
      );
    }

    if (this.isCurrent(generation)) {
      publishChatOverlayEvent(this.ownerUid, toChatOverlayEvent(message, rating));
    }
  }

  private markSubscribed(generation: number): void {
    if (!this.isCurrent(generation)) {
      return;
    }

    this.clearTimer("subscriptionDeadline");
    this.status.subscribed = true;
    this.status.health = getHealthyChzzkSessionState(
      this.status.lastChatAt,
      Date.now(),
      this.policy
    );
    this.status.lastHealthyAt = new Date().toISOString();
    this.status.lastError = null;
    this.invalidHealthChecks = 0;
    this.startHealthChecks(generation);
    this.logger?.info(
      { ownerUid: this.ownerUid, sessionKey: this.status.sessionKey },
      "Chzzk CHAT event subscribed"
    );
  }

  private startConnectionDeadline(generation: number): void {
    this.connectionDeadline = setTimeout(() => {
      if (this.isCurrent(generation) && !this.status.sessionKey) {
        this.scheduleReconnect("Session key was not received before deadline");
      }
    }, this.policy.connectionTimeoutMs);
    this.connectionDeadline.unref();
  }

  private startSubscriptionDeadline(generation: number): void {
    this.clearTimer("subscriptionDeadline");
    this.subscriptionDeadline = setTimeout(() => {
      if (this.isCurrent(generation) && !this.status.subscribed) {
        this.status.health = "subscription_failed";
        this.scheduleReconnect("CHAT subscription acknowledgement timed out");
      }
    }, this.policy.subscriptionTimeoutMs);
    this.subscriptionDeadline.unref();
  }

  private startHealthChecks(generation: number): void {
    this.clearTimer("healthCheckTimer");
    this.healthCheckTimer = setInterval(() => {
      void this.runHealthCheck(generation);
    }, this.policy.healthCheckIntervalMs);
    this.healthCheckTimer.unref();
  }

  private async runHealthCheck(generation: number): Promise<void> {
    if (!this.isCurrent(generation) || this.healthCheckInFlight) {
      return;
    }

    const { sessionKey } = this.status;

    if (!this.config || !this.accessToken || !sessionKey) {
      this.scheduleReconnect("Session health state was incomplete");
      return;
    }

    this.healthCheckInFlight = true;
    this.status.lastHealthCheckAt = new Date().toISOString();

    try {
      const sessions = await this.dependencies.getUserSessions(
        this.config,
        this.accessToken
      );

      if (!this.isCurrent(generation)) {
        return;
      }

      if (isChzzkSessionControlPlaneHealthy(sessions, sessionKey)) {
        this.invalidHealthChecks = 0;
        this.status.reconnectAttempt = 0;
        this.status.health = getHealthyChzzkSessionState(
          this.status.lastChatAt,
          Date.now(),
          this.policy
        );
        this.status.lastHealthyAt = new Date().toISOString();
        this.status.lastError = null;
        this.logger?.debug(
          { ownerUid: this.ownerUid, sessionKey, health: this.status.health },
          "Chzzk session watchdog confirmed control-plane health"
        );
        return;
      }

      this.invalidHealthChecks += 1;
      this.status.health = "unknown";
      this.status.lastError = `Session health check failed ${this.invalidHealthChecks} time(s)`;

      if (this.invalidHealthChecks >= this.policy.invalidHealthCheckThreshold) {
        this.scheduleReconnect("Session list did not confirm an active CHAT subscription");
      }
    } catch (error) {
      if (this.isCurrent(generation)) {
        this.status.health = "unknown";
        this.status.lastError = errorMessage(error);
        this.logger?.warn(
          { err: error, ownerUid: this.ownerUid },
          "Chzzk session health check request failed"
        );
      }
    } finally {
      this.healthCheckInFlight = false;
    }
  }

  private scheduleReconnect(reason: string): void {
    if (!this.active || this.reconnectTimer) {
      return;
    }

    this.generation += 1;
    this.clearConnectionResources();
    this.status.health = "reconnecting";
    this.status.connected = false;
    this.status.sessionKey = null;
    this.status.subscribed = false;
    this.status.lastError = reason;
    this.status.reconnectAttempt += 1;

    const jitter = 0.8 + this.dependencies.random() * 0.4;
    const delay = getChzzkReconnectDelay(
      this.status.reconnectAttempt,
      this.policy,
      jitter
    );
    this.logger?.warn(
      { ownerUid: this.ownerUid, reason, delay, attempt: this.status.reconnectAttempt },
      "Chzzk fresh session reconnect scheduled"
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectFreshSession(false);
    }, delay);
    this.reconnectTimer.unref();
  }

  private clearConnectionResources(): void {
    this.clearWatchdogTimers();

    const socket = this.socket;
    this.socket = null;
    socket?.disconnect();
  }

  private clearWatchdogTimers(): void {
    this.clearTimer("connectionDeadline");
    this.clearTimer("subscriptionDeadline");
    this.clearTimer("healthCheckTimer");
  }

  private clearReconnectTimer(): void {
    this.clearTimer("reconnectTimer");
  }

  private clearTimer(
    name:
      | "connectionDeadline"
      | "subscriptionDeadline"
      | "healthCheckTimer"
      | "reconnectTimer"
  ): void {
    const timer = this[name];

    if (timer) {
      clearTimeout(timer);
      this[name] = null;
    }
  }

  private isCurrent(generation: number): boolean {
    return this.active && generation === this.generation;
  }
}

type ChzzkSessionFactory = (ownerUid: string) => ManagedChzzkSession;

export class ChzzkSessionManager {
  private readonly sessions = new Map<string, ManagedChzzkSession>();

  constructor(
    private readonly createSession: ChzzkSessionFactory = (ownerUid) =>
      new ChzzkSession(ownerUid)
  ) {}

  async start(
    ownerUid: string,
    config: ChzzkAuthConfig,
    accessToken: string,
    logger: FastifyBaseLogger
  ): Promise<ChzzkSessionStatus> {
    this.stop(ownerUid);

    const session = this.createSession(ownerUid);
    this.sessions.set(ownerUid, session);

    try {
      return await session.start(config, accessToken, logger);
    } catch (error) {
      if (this.sessions.get(ownerUid) === session) {
        this.sessions.delete(ownerUid);
        session.stop();
      }

      throw error;
    }
  }

  stop(ownerUid: string): boolean {
    const session = this.sessions.get(ownerUid);

    if (!session) {
      return false;
    }

    this.sessions.delete(ownerUid);
    session.stop();
    return true;
  }

  stopAll(): void {
    for (const session of this.sessions.values()) {
      session.stop();
    }

    this.sessions.clear();
  }

  getStatus(ownerUid: string): ChzzkSessionStatus | null {
    return this.sessions.get(ownerUid)?.getStatus() ?? null;
  }

  updateAccessToken(ownerUid: string, accessToken: string): boolean {
    const session = this.sessions.get(ownerUid);

    if (!session) {
      return false;
    }

    session.updateAccessToken(accessToken);
    return true;
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
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

function toChatOverlayEvent(
  message: z.infer<typeof chatMessageSchema>,
  rating: RatingBadge | null
): ChatOverlayEvent {
  return {
    id: `chzzk:${message.channelId}:${message.senderChannelId}:${message.messageTime}`,
    nickname: message.profile.nickname,
    content: message.content,
    rating,
    chzzkBadges: normalizeChzzkBadges(message.profile.badges),
    emojis: normalizeChzzkEmojis(message.emojis),
    authorKind: classifyChzzkChatAuthor(message.profile),
    sentAt: new Date(message.messageTime).toISOString(),
    source: {
      provider: "chzzk",
      channelId: message.channelId,
      senderChannelId: message.senderChannelId,
      messageTime: message.messageTime
    }
  };
}

function normalizeChzzkEmojis(
  emojis: Record<string, string> | undefined
): ChzzkEmoji[] {
  const normalized: ChzzkEmoji[] = [];

  for (const [key, imageUrl] of Object.entries(emojis ?? {})) {
    const token = normalizeChzzkEmojiToken(key);

    if (!token || !isHttpsUrl(imageUrl)) {
      continue;
    }

    normalized.push({ token, imageUrl });

    if (normalized.length === MAX_CHZZK_EMOJIS_PER_MESSAGE) {
      break;
    }
  }

  return normalized;
}

function normalizeChzzkEmojiToken(key: string): string | null {
  const trimmed = key.trim();

  if (/^\{:[^{}]{1,100}:\}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^:[^{}]{1,100}:$/.test(trimmed)) {
    return `{${trimmed}}`;
  }

  if (/^[^{}:]{1,100}$/.test(trimmed)) {
    return `{:${trimmed}:}`;
  }

  return null;
}

function normalizeChzzkBadges(badges: unknown[] | undefined): ChzzkBadge[] {
  const normalized: ChzzkBadge[] = [];
  const seenUrls = new Set<string>();

  for (const badge of badges ?? []) {
    if (!badge || typeof badge !== "object") {
      continue;
    }

    const imageUrl = (badge as { imageUrl?: unknown }).imageUrl;

    if (
      typeof imageUrl !== "string" ||
      !isHttpsUrl(imageUrl) ||
      seenUrls.has(imageUrl)
    ) {
      continue;
    }

    seenUrls.add(imageUrl);
    normalized.push({ imageUrl });

    if (normalized.length === MAX_CHZZK_BADGES_PER_MESSAGE) {
      break;
    }
  }

  return normalized;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function redactSessionUrl(url: string) {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
