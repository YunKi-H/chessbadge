import assert from "node:assert/strict";
import test from "node:test";
import {
  revokeOverlayConnections,
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
