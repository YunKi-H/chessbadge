import assert from "node:assert/strict";
import test from "node:test";
import { getHighestChessComRating } from "./rating-selection.js";

test("selects the numerically highest Chess.com rating", () => {
  assert.deepEqual(
    getHighestChessComRating([
      { speed: "bullet", value: 1700 },
      { speed: "blitz", value: 1800 },
      { speed: "rapid", value: 1600 }
    ]),
    { speed: "blitz", value: 1800 }
  );
});

test("prefers rapid, then blitz, then bullet when ratings are tied", () => {
  assert.deepEqual(
    getHighestChessComRating([
      { speed: "bullet", value: 1800 },
      { speed: "rapid", value: 1800 },
      { speed: "blitz", value: 1800 }
    ]),
    { speed: "rapid", value: 1800 }
  );
});

test("returns null when the account has no supported rating", () => {
  assert.equal(getHighestChessComRating([]), null);
});
