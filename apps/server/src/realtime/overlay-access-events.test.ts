import assert from "node:assert/strict";
import test from "node:test";
import {
  publishOverlayAppearance,
  revokeOverlayConnections,
  subscribeOverlayAppearance,
  subscribeOverlayRevocation
} from "./overlay-access-events.js";

test("overlay revocation only closes connections for the rotated token", () => {
  let firstTokenRevocations = 0;
  let secondTokenRevocations = 0;
  const unsubscribeFirst = subscribeOverlayRevocation("first-token", () => {
    firstTokenRevocations += 1;
  });
  const unsubscribeSecond = subscribeOverlayRevocation("second-token", () => {
    secondTokenRevocations += 1;
  });

  revokeOverlayConnections("first-token");
  unsubscribeFirst();
  unsubscribeSecond();

  assert.equal(firstTokenRevocations, 1);
  assert.equal(secondTokenRevocations, 0);
});

test("overlay appearance updates are scoped to one public token", () => {
  const updates: string[] = [];
  const unsubscribeFirst = subscribeOverlayAppearance("first-token", (appearance) => {
    updates.push(appearance.messageColor);
  });
  const unsubscribeSecond = subscribeOverlayAppearance("second-token", () => {
    updates.push("unexpected");
  });

  publishOverlayAppearance("first-token", {
    backgroundVisible: true,
    backgroundColor: "#020617",
    backgroundOpacity: 75,
    nicknameVisible: false,
    nicknameColorMode: "by_user",
    nicknameColor: "#7DD3FC",
    messageColor: "#00FF00"
  });
  unsubscribeFirst();
  unsubscribeSecond();

  assert.deepEqual(updates, ["#00FF00"]);
});
