import type { ChzzkUserSession } from "../auth/chzzk/client.js";

export type ChzzkSessionHealth =
  | "connecting"
  | "healthy_idle"
  | "healthy_active"
  | "reconnecting"
  | "subscription_failed"
  | "connection_failed"
  | "unknown";

export interface ChzzkSessionPolicy {
  connectionTimeoutMs: number;
  subscriptionTimeoutMs: number;
  healthCheckIntervalMs: number;
  invalidHealthCheckThreshold: number;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  activeChatWindowMs: number;
}

export const defaultChzzkSessionPolicy: ChzzkSessionPolicy = {
  connectionTimeoutMs: 10_000,
  subscriptionTimeoutMs: 10_000,
  healthCheckIntervalMs: 60_000,
  invalidHealthCheckThreshold: 2,
  reconnectBaseDelayMs: 1_000,
  reconnectMaxDelayMs: 60_000,
  activeChatWindowMs: 5 * 60_000
};

export function isChzzkSessionControlPlaneHealthy(
  sessions: ChzzkUserSession[],
  sessionKey: string
): boolean {
  const session = sessions.find((item) => item.sessionKey === sessionKey);

  return Boolean(
    session &&
      !session.disconnectedDate &&
      session.subscribedEvents.some((event) => event.eventType === "CHAT")
  );
}

export function getChzzkReconnectDelay(
  attempt: number,
  policy: ChzzkSessionPolicy = defaultChzzkSessionPolicy,
  jitter = 1
): number {
  const exponentialDelay =
    policy.reconnectBaseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.round(
    Math.min(exponentialDelay * jitter, policy.reconnectMaxDelayMs)
  );
}

export function getHealthyChzzkSessionState(
  lastChatAt: string | null,
  now = Date.now(),
  policy: ChzzkSessionPolicy = defaultChzzkSessionPolicy
): ChzzkSessionHealth {
  if (!lastChatAt) {
    return "healthy_idle";
  }

  const elapsed = now - Date.parse(lastChatAt);
  return elapsed <= policy.activeChatWindowMs
    ? "healthy_active"
    : "healthy_idle";
}
