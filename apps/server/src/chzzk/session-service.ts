import type { FastifyBaseLogger } from "fastify";
import {
  ChzzkTokenRequestError,
  type ChzzkAuthConfig
} from "../auth/chzzk/client.js";
import {
  getChzzkStreamerSessionIntent,
  listRestorableChzzkStreamerUids,
  setChzzkChatSessionEnabled
} from "../firebase/users.js";
import { chzzkSessionManager, type ChzzkSessionStatus } from "./session.js";
import { chzzkTokenManager } from "./token-manager.js";

const RESTORE_CONCURRENCY = 5;
const INITIAL_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1_000;

interface SessionServiceDependencies {
  listRestorableUids(): Promise<string[]>;
  getSessionIntent(uid: string): Promise<{
    enabled: boolean;
    tokenStatus: "active" | "reauth_required" | null;
  }>;
  setSessionEnabled(uid: string, enabled: boolean): Promise<void>;
  getValidAccessToken(uid: string, config: ChzzkAuthConfig): Promise<string>;
  startSession(
    uid: string,
    config: ChzzkAuthConfig,
    accessToken: string,
    logger: FastifyBaseLogger
  ): Promise<ChzzkSessionStatus>;
  stopSession(uid: string): boolean;
  getSessionStatus(uid: string): ChzzkSessionStatus | null;
  startTokenRefresh(
    uid: string,
    config: ChzzkAuthConfig,
    logger: FastifyBaseLogger
  ): Promise<void>;
  stopTokenRefresh(uid: string): void;
}

const defaultDependencies: SessionServiceDependencies = {
  listRestorableUids: listRestorableChzzkStreamerUids,
  getSessionIntent: getChzzkStreamerSessionIntent,
  setSessionEnabled: setChzzkChatSessionEnabled,
  getValidAccessToken: (uid, config) =>
    chzzkTokenManager.getValidAccessToken(uid, config),
  startSession: (uid, config, accessToken, logger) =>
    chzzkSessionManager.start(uid, config, accessToken, logger),
  stopSession: (uid) => chzzkSessionManager.stop(uid),
  getSessionStatus: (uid) => chzzkSessionManager.getStatus(uid),
  startTokenRefresh: (uid, config, logger) =>
    chzzkTokenManager.startAutoRefresh(uid, config, logger),
  stopTokenRefresh: (uid) => chzzkTokenManager.stopAutoRefresh(uid)
};

export class ChzzkSessionService {
  private readonly operations = new Map<string, Promise<void>>();
  private readonly retryTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly dependencies: SessionServiceDependencies = defaultDependencies
  ) {}

  async startAfterLogin(
    uid: string,
    config: ChzzkAuthConfig,
    accessToken: string,
    logger: FastifyBaseLogger
  ): Promise<void> {
    this.cancelRetry(uid);

    try {
      await this.runSerially(uid, async () => {
        await this.dependencies.setSessionEnabled(uid, true);
        await this.dependencies.startSession(uid, config, accessToken, logger);
        await this.dependencies.startTokenRefresh(uid, config, logger);
      });
    } catch (error) {
      this.scheduleRetry(uid, config, logger, 0);
      throw error;
    }
  }

  async stop(uid: string): Promise<boolean> {
    this.cancelRetry(uid);

    return this.runSerially(uid, async () => {
      await this.dependencies.setSessionEnabled(uid, false);
      this.dependencies.stopTokenRefresh(uid);
      return this.dependencies.stopSession(uid);
    });
  }

  getStatus(uid: string): ChzzkSessionStatus | null {
    return this.dependencies.getSessionStatus(uid);
  }

  async restoreEnabledSessions(
    config: ChzzkAuthConfig,
    logger: FastifyBaseLogger
  ): Promise<void> {
    const uids = await this.dependencies.listRestorableUids();
    let nextIndex = 0;
    let restored = 0;

    const worker = async () => {
      while (nextIndex < uids.length) {
        const uid = uids[nextIndex];
        nextIndex += 1;

        if (uid && (await this.attemptRestore(uid, config, logger, 0))) {
          restored += 1;
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(RESTORE_CONCURRENCY, uids.length) },
        () => worker()
      )
    );

    logger.info(
      { candidates: uids.length, restored },
      "Chzzk session startup recovery completed"
    );
  }

  private async attemptRestore(
    uid: string,
    config: ChzzkAuthConfig,
    logger: FastifyBaseLogger,
    attempt: number
  ): Promise<boolean> {
    try {
      const restored = await this.runSerially(uid, async () => {
        const initialIntent = await this.dependencies.getSessionIntent(uid);

        if (!initialIntent.enabled || initialIntent.tokenStatus !== "active") {
          return false;
        }

        const accessToken = await this.dependencies.getValidAccessToken(uid, config);
        const currentIntent = await this.dependencies.getSessionIntent(uid);

        if (!currentIntent.enabled || currentIntent.tokenStatus !== "active") {
          return false;
        }

        await this.dependencies.startSession(uid, config, accessToken, logger);
        await this.dependencies.startTokenRefresh(uid, config, logger);
        return true;
      });

      if (restored) {
        this.cancelRetry(uid);
        logger.info({ uid }, "Chzzk session restored");
      }

      return restored;
    } catch (error) {
      logger.error(
        { err: error, uid, attempt },
        "Chzzk session startup recovery failed"
      );

      if (!(error instanceof ChzzkTokenRequestError && error.status === 401)) {
        this.scheduleRetry(uid, config, logger, attempt + 1);
      }

      return false;
    }
  }

  private scheduleRetry(
    uid: string,
    config: ChzzkAuthConfig,
    logger: FastifyBaseLogger,
    attempt: number
  ): void {
    if (this.retryTimers.has(uid)) {
      return;
    }

    const delay = Math.min(
      INITIAL_RETRY_DELAY_MS * 2 ** Math.min(attempt, 10),
      MAX_RETRY_DELAY_MS
    );
    const timer = setTimeout(() => {
      this.retryTimers.delete(uid);
      void this.attemptRestore(uid, config, logger, attempt);
    }, delay);
    timer.unref();
    this.retryTimers.set(uid, timer);

    logger.warn({ uid, attempt, delay }, "Chzzk session recovery retry scheduled");
  }

  private cancelRetry(uid: string): void {
    const timer = this.retryTimers.get(uid);

    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(uid);
    }
  }

  private runSerially<T>(uid: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.operations.get(uid) ?? Promise.resolve();
    const current = previous.then(operation, operation);
    const tail = current.then(
      () => undefined,
      () => undefined
    );
    this.operations.set(uid, tail);

    void tail.then(() => {
      if (this.operations.get(uid) === tail) {
        this.operations.delete(uid);
      }
    });

    return current;
  }
}

export const chzzkSessionService = new ChzzkSessionService();
