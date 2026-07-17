import assert from "node:assert/strict";
import test from "node:test";
import {
  generateOverlayPublicToken,
  normalizeOverlayAppearance
} from "./overlays.js";

test("overlay public tokens are URL-safe, random 256-bit values", () => {
  const tokens = new Set(
    Array.from({ length: 100 }, () => generateOverlayPublicToken())
  );

  assert.equal(tokens.size, 100);

  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  }
});

test("overlay appearance falls back safely for legacy theme documents", () => {
  assert.deepEqual(normalizeOverlayAppearance({}), {
    backgroundVisible: true,
    backgroundColor: "#020617",
    backgroundOpacity: 90,
    chzzkBadgesVisible: true,
    chzzkBadgeVisibility: {
      role: true,
      subscription: true,
      donation: true,
      subscription_gift: true,
      unknown: true
    },
    nicknameVisible: true,
    nicknameColorMode: "fixed",
    nicknameColor: "#7DD3FC",
    nicknameRoleColors: {
      streamer: "#34D399",
      manager: "#60A5FA",
      donator: "#FBBF24",
      subscriber: "#C084FC",
      viewer: "#E2E8F0"
    },
    messageColor: "#FFFFFF",
    messageDurationSeconds: 20
  });

  assert.deepEqual(
    normalizeOverlayAppearance({
      backgroundVisible: false,
      backgroundColor: "#abcdef",
      backgroundOpacity: 35,
      chzzkBadgesVisible: false,
      chzzkBadgeVisibility: {
        role: false,
        subscription: true,
        donation: false,
        subscription_gift: true,
        unknown: false
      },
      nicknameVisible: false,
      nicknameColorMode: "by_user",
      nicknameColor: "#fedcba",
      nicknameRoleColors: {
        streamer: "#111111",
        manager: "#222222",
        donator: "#333333",
        subscriber: "#444444",
        viewer: "#555555"
      },
      messageColor: "#aabbcc",
      messageDurationSeconds: 60
    }),
    {
      backgroundVisible: false,
      backgroundColor: "#ABCDEF",
      backgroundOpacity: 35,
      chzzkBadgesVisible: false,
      chzzkBadgeVisibility: {
        role: false,
        subscription: true,
        donation: false,
        subscription_gift: true,
        unknown: false
      },
      nicknameVisible: false,
      nicknameColorMode: "by_user",
      nicknameColor: "#FEDCBA",
      nicknameRoleColors: {
        streamer: "#111111",
        manager: "#222222",
        donator: "#333333",
        subscriber: "#444444",
        viewer: "#555555"
      },
      messageColor: "#AABBCC",
      messageDurationSeconds: 60
    }
  );
});

test("overlay appearance fills missing badge visibility for legacy themes", () => {
  assert.deepEqual(normalizeOverlayAppearance({}).chzzkBadgeVisibility, {
    role: true,
    subscription: true,
    donation: true,
    subscription_gift: true,
    unknown: true
  });

  assert.deepEqual(
    normalizeOverlayAppearance({
      chzzkBadgeVisibility: { donation: false, unknown: false }
    }).chzzkBadgeVisibility,
    {
      role: true,
      subscription: true,
      donation: false,
      subscription_gift: true,
      unknown: false
    }
  );
});
