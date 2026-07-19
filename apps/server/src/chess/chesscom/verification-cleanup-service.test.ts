import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyBaseLogger } from "fastify";
import { ChessComVerificationCleanupService } from "./verification-cleanup-service.js";

const now = new Date("2026-07-20T00:00:00.000Z");

test("cleanup deletes expired verification challenges for the current time", async () => {
  let receivedNow: Date | undefined;
  const infoLogs: unknown[] = [];
  const service = new ChessComVerificationCleanupService({
    cleanup: async (value) => {
      receivedNow = value;
      return 3;
    },
    now: () => now
  });

  await service.cleanupExpiredChallenges(createLogger({ infoLogs }));

  assert.equal(receivedNow, now);
  assert.equal(infoLogs.length, 1);
});

test("cleanup prevents overlapping scans", async () => {
  let releaseCleanup: (() => void) | undefined;
  let cleanupCalls = 0;
  const service = new ChessComVerificationCleanupService({
    cleanup: async () => {
      cleanupCalls += 1;
      await new Promise<void>((resolve) => {
        releaseCleanup = resolve;
      });
      return 0;
    },
    now: () => now
  });
  const logger = createLogger();

  const first = service.cleanupExpiredChallenges(logger);
  await Promise.resolve();
  await service.cleanupExpiredChallenges(logger);
  releaseCleanup?.();
  await first;

  assert.equal(cleanupCalls, 1);
});

test("cleanup logs Firestore failures without rejecting", async () => {
  const errorLogs: unknown[] = [];
  const service = new ChessComVerificationCleanupService({
    cleanup: async () => {
      throw new Error("unavailable");
    },
    now: () => now
  });

  await service.cleanupExpiredChallenges(createLogger({ errorLogs }));

  assert.equal(errorLogs.length, 1);
});

function createLogger(
  logs: { infoLogs?: unknown[]; errorLogs?: unknown[] } = {}
): FastifyBaseLogger {
  return {
    info(value: unknown) {
      logs.infoLogs?.push(value);
    },
    error(value: unknown) {
      logs.errorLogs?.push(value);
    }
  } as unknown as FastifyBaseLogger;
}
