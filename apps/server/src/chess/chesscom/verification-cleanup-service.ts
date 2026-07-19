import type { FastifyBaseLogger } from "fastify";
import {
  deleteExpiredChessVerificationChallenges,
  VERIFICATION_CLEANUP_BATCH_SIZE
} from "../../firebase/chess-verification-cleanup.js";

const STARTUP_DELAY_MS = 10_000;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1_000;

interface VerificationCleanupServiceDependencies {
  cleanup(now: Date): Promise<number>;
  now(): Date;
}

export class ChessComVerificationCleanupService {
  private startupTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private cleanupRunning = false;

  constructor(
    private readonly dependencies: VerificationCleanupServiceDependencies = {
      cleanup: deleteExpiredChessVerificationChallenges,
      now: () => new Date()
    }
  ) {}

  start(logger: FastifyBaseLogger): void {
    if (this.startupTimer || this.cleanupTimer) {
      return;
    }

    logger.info(
      {
        intervalHours: CLEANUP_INTERVAL_MS / (60 * 60 * 1_000),
        batchSize: VERIFICATION_CLEANUP_BATCH_SIZE
      },
      "Chess.com verification cleanup scheduled"
    );

    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      void this.cleanupExpiredChallenges(logger);
    }, STARTUP_DELAY_MS);
    this.startupTimer.unref();

    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpiredChallenges(logger);
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

  async cleanupExpiredChallenges(logger: FastifyBaseLogger): Promise<void> {
    if (this.cleanupRunning) {
      return;
    }

    this.cleanupRunning = true;

    try {
      const deleted = await this.dependencies.cleanup(this.dependencies.now());

      if (deleted > 0) {
        logger.info(
          { deleted },
          "Expired Chess.com verification challenges deleted"
        );
      }
    } catch (error) {
      logger.error(
        { err: error },
        "Chess.com verification challenge cleanup failed"
      );
    } finally {
      this.cleanupRunning = false;
    }
  }
}

export const chessComVerificationCleanupService =
  new ChessComVerificationCleanupService();
