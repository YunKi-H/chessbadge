import assert from "node:assert/strict";
import test from "node:test";
import { ChzzkBadgeDiagnostics } from "./badge-diagnostics.js";

test("badge diagnostics are disabled by default", () => {
  const entries: unknown[] = [];
  const diagnostics = new ChzzkBadgeDiagnostics(false);

  diagnostics.record(
    { badges: [{ badgeType: "subscription" }] },
    { info: (context) => entries.push(context) }
  );

  assert.deepEqual(entries, []);
});

test("badge diagnostics log sanitized unique structures", () => {
  const entries: Array<{ context: unknown; message?: string }> = [];
  const diagnostics = new ChzzkBadgeDiagnostics(true);
  const logger = {
    info(context: unknown, message?: string) {
      entries.push({ context, message });
    }
  };
  const profile = {
    badges: [
      {
        badgeType: "subscription",
        badgeName: "Tier 1",
        imageUrl: "https://example.com/private-image.png",
        unrelated: "not logged"
      }
    ],
    verifiedMark: true,
    userRoleCode: "common_user"
  };

  diagnostics.record(profile, logger);
  diagnostics.record(profile, logger);

  assert.deepEqual(entries, [
    {
      context: {
        badgeCount: 1,
        badges: [
          {
            fields: ["badgeName", "badgeType", "imageUrl", "unrelated"],
            metadata: {
              badgeName: "Tier 1",
              badgeType: "subscription"
            }
          }
        ],
        verifiedMark: true,
        userRoleCode: "common_user"
      },
      message: "Chzzk badge diagnostic"
    }
  ]);
});
