import assert from "node:assert/strict";
import test from "node:test";
import { classifyChzzkBadge } from "./badge-classifier.js";

test("classifies observed Chzzk badge image paths", () => {
  const cases = [
    ["/static/nng/glive/icon/manager.png", "role"],
    ["/static/nng/glive/icon/streamer.png", "role"],
    ["/glive/subscription/badge/channel/1/custom.png", "subscription"],
    ["/static/nng/glive/badge/fan_01.png", "donation"],
    ["/static/nng/glive/badge/fan_03.png", "donation"],
    ["/static/nng/glive/badge/gift_sub_1.png", "subscription_gift"],
    ["/static/nng/glive/badge/recap_25.png", "unknown"]
  ] as const;

  for (const [path, expected] of cases) {
    assert.equal(
      classifyChzzkBadge({ imageUrl: `https://ssl.pstatic.net${path}` }),
      expected
    );
  }
});

test("falls back to badgeType when present", () => {
  assert.equal(classifyChzzkBadge({ badgeType: "subscription" }), "subscription");
  assert.equal(classifyChzzkBadge({ badgeType: "donation_rank" }), "donation");
  assert.equal(
    classifyChzzkBadge({ badgeType: "subscription_gift" }),
    "subscription_gift"
  );
});

test("preserves unrecognized badges as unknown", () => {
  assert.equal(
    classifyChzzkBadge({
      imageUrl: "https://ssl.pstatic.net/static/nng/glive/badge/new_badge.png"
    }),
    "unknown"
  );
  assert.equal(classifyChzzkBadge({ badgeType: "event" }), "unknown");
  assert.equal(classifyChzzkBadge(null), "unknown");
});
