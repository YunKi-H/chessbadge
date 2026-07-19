import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyBaseLogger } from "fastify";
import { OverlayCleanupService } from "./overlay-cleanup-service.js";

test("overlay cleanup logs deleted orphan documents", async () => {
  const infoLogs: unknown[] = [];
  const service = new OverlayCleanupService({
    cleanup: async () => ({ scanned: 4, deleted: 3 })
  });

  await service.cleanupInactiveOverlays(createLogger({ infoLogs }));

  assert.equal(infoLogs.length, 1);
});

test("overlay cleanup prevents overlapping scans", async () => {
  let releaseCleanup: (() => void) | undefined;
  let cleanupCalls = 0;
  const service = new OverlayCleanupService({
    cleanup: async () => {
      cleanupCalls += 1;
      await new Promise<void>((resolve) => {
        releaseCleanup = resolve;
      });
      return { scanned: 0, deleted: 0 };
    }
  });
  const logger = createLogger();

  const first = service.cleanupInactiveOverlays(logger);
  await Promise.resolve();
  await service.cleanupInactiveOverlays(logger);
  releaseCleanup?.();
  await first;

  assert.equal(cleanupCalls, 1);
});

test("overlay cleanup logs Firestore failures without rejecting", async () => {
  const errorLogs: unknown[] = [];
  const service = new OverlayCleanupService({
    cleanup: async () => {
      throw new Error("unavailable");
    }
  });

  await service.cleanupInactiveOverlays(createLogger({ errorLogs }));

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
