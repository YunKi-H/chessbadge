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
    nicknameVisible: true,
    nicknameColorMode: "fixed",
    nicknameColor: "#7DD3FC",
    messageColor: "#FFFFFF"
  });

  assert.deepEqual(
    normalizeOverlayAppearance({
      backgroundVisible: false,
      backgroundColor: "#abcdef",
      backgroundOpacity: 35,
      nicknameVisible: false,
      nicknameColorMode: "by_user",
      nicknameColor: "#fedcba",
      messageColor: "#aabbcc"
    }),
    {
      backgroundVisible: false,
      backgroundColor: "#ABCDEF",
      backgroundOpacity: 35,
      nicknameVisible: false,
      nicknameColorMode: "by_user",
      nicknameColor: "#FEDCBA",
      messageColor: "#AABBCC"
    }
  );
});
