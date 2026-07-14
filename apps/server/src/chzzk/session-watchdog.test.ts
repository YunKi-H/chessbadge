import assert from "node:assert/strict";
import test from "node:test";
import {
  getChzzkReconnectDelay,
  getHealthyChzzkSessionState,
  isChzzkSessionControlPlaneHealthy
} from "./session-watchdog.js";

test("watchdog requires a connected session with a CHAT subscription", () => {
  const baseSession = {
    sessionKey: "session-1",
    connectedDate: "2026-07-15T00:00:00Z",
    disconnectedDate: null,
    subscribedEvents: [{ eventType: "CHAT", channelId: "channel-1" }]
  };

  assert.equal(
    isChzzkSessionControlPlaneHealthy([baseSession], "session-1"),
    true
  );
  assert.equal(
    isChzzkSessionControlPlaneHealthy(
      [{ ...baseSession, disconnectedDate: "2026-07-15T00:01:00Z" }],
      "session-1"
    ),
    false
  );
  assert.equal(
    isChzzkSessionControlPlaneHealthy(
      [{ ...baseSession, subscribedEvents: [] }],
      "session-1"
    ),
    false
  );
});

test("reconnect delay uses capped exponential backoff", () => {
  assert.equal(getChzzkReconnectDelay(1, undefined, 1), 1_000);
  assert.equal(getChzzkReconnectDelay(4, undefined, 1), 8_000);
  assert.equal(getChzzkReconnectDelay(20, undefined, 1), 60_000);
});

test("chat inactivity is classified as idle instead of unhealthy", () => {
  const now = Date.parse("2026-07-15T01:00:00Z");

  assert.equal(getHealthyChzzkSessionState(null, now), "healthy_idle");
  assert.equal(
    getHealthyChzzkSessionState("2026-07-15T00:00:00Z", now),
    "healthy_idle"
  );
  assert.equal(
    getHealthyChzzkSessionState("2026-07-15T00:59:00Z", now),
    "healthy_active"
  );
});
