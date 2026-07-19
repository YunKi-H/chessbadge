import type { FastifyBaseLogger } from "fastify";
import {
  deleteOrphanedInactiveOverlays,
  type OverlayCleanupResult
} from "./overlay-cleanup.js";

const STARTUP_DELAY_MS = 20_000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;

interface OverlayCleanupServiceDependencies {
  cleanup(): Promise<OverlayCleanupResult>;
}

export class OverlayCleanupService {
  private startupTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private cleanupRunning = false;

  constructor(
    private readonly dependencies: OverlayCleanupServiceDependencies = {
      cleanup: deleteOrphanedInactiveOverlays
    }
  ) {}

  start(logger: FastifyBaseLogger): void {
    if (this.startupTimer || this.cleanupTimer) {
      return;
    }

    logger.info(
      {
        intervalHours: CLEANUP_INTERVAL_MS / (60 * 60 * 1_000)
      },
      "Inactive overlay cleanup scheduled"
    );

    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      void this.cleanupInactiveOverlays(logger);
    }, STARTUP_DELAY_MS);
    this.startupTimer.unref();

    this.cleanupTimer = setInterval(() => {
      void this.cleanupInactiveOverlays(logger);
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  stop(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async cleanupInactiveOverlays(logger: FastifyBaseLogger): Promise<void> {
    if (this.cleanupRunning) {
      return;
    }

    this.cleanupRunning = true;

    try {
      const result = await this.dependencies.cleanup();

      if (result.deleted > 0) {
        logger.info(
          result,
          "Orphaned inactive overlay documents deleted"
        );
      }
    } catch (error) {
      logger.error({ err: error }, "Inactive overlay cleanup failed");
    } finally {
      this.cleanupRunning = false;
    }
  }
}

export const overlayCleanupService = new OverlayCleanupService();
