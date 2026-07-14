import type { FastifyBaseLogger } from "fastify";
import {
  ChzzkTokenRequestError,
  refreshChzzkAccessToken,
  type ChzzkAuthConfig,
  type ChzzkTokenResponse
} from "../auth/chzzk/client.js";
import {
  loadChzzkStreamerTokens,
  markChzzkStreamerReauthenticationRequired,
  saveChzzkStreamerTokens,
  type StoredChzzkTokens
} from "../firebase/chzzk-tokens.js";
import { getChzzkStreamerSessionIntent } from "../firebase/users.js";
import { chzzkSessionManager } from "./session.js";

const REFRESH_WINDOW_MS = 5 * 60 * 1_000;
const RETRY_DELAY_MS = 60 * 1_000;

interface AutoRefreshState {
  config: ChzzkAuthConfig;
  logger: FastifyBaseLogger;
  timer: NodeJS.Timeout | null;
}

class ChzzkTokenManager {
  private readonly autoRefreshStates = new Map<string, AutoRefreshState>();
  private readonly refreshes = new Map<string, Promise<StoredChzzkTokens>>();

  async startAutoRefresh(
    uid: string,
    config: ChzzkAuthConfig,
    logger: FastifyBaseLogger
  ): Promise<void> {
    this.stopAutoRefresh(uid);

    const storedToken = await loadChzzkStreamerTokens(uid);

    if (!storedToken) {
      throw new Error(`No stored Chzzk token for ${uid}`);
    }

    const state: AutoRefreshState = { config, logger, timer: null };
    this.autoRefreshStates.set(uid, state);
    this.schedule(uid, state, storedToken.expiresAt);
  }

  stopAutoRefresh(uid: string): void {
    const state = this.autoRefreshStates.get(uid);

    if (state?.timer) {
      clearTimeout(state.timer);
    }

    this.autoRefreshStates.delete(uid);
  }

  async getValidAccessToken(
    uid: string,
    config: ChzzkAuthConfig
  ): Promise<string> {
    const storedToken = await loadChzzkStreamerTokens(uid);

    if (!storedToken) {
      throw new Error(`No stored Chzzk token for ${uid}`);
    }

    if (getTokenRefreshDelay(storedToken.expiresAt) > 0) {
      return storedToken.accessToken;
    }

    return (await this.refresh(uid, config)).accessToken;
  }

  private schedule(
    uid: string,
    state: AutoRefreshState,
    expiresAt: Date,
    delayOverride?: number
  ): void {
    if (this.autoRefreshStates.get(uid) !== state) {
      return;
    }

    if (state.timer) {
      clearTimeout(state.timer);
    }

    const delay = delayOverride ?? getTokenRefreshDelay(expiresAt);
    state.timer = setTimeout(() => void this.runScheduledRefresh(uid, state), delay);
    state.timer.unref();
  }

  private async runScheduledRefresh(
    uid: string,
    state: AutoRefreshState
  ): Promise<void> {
    if (this.autoRefreshStates.get(uid) !== state) {
      return;
    }

    state.timer = null;

    try {
      const intent = await getChzzkStreamerSessionIntent(uid);

      if (intent.tokenStatus !== "active") {
        this.stopAutoRefresh(uid);
        state.logger.warn({ uid }, "Chzzk token auto-refresh stopped pending reauthentication");
        return;
      }

      const refreshedToken = await this.refresh(uid, state.config);

      if (this.autoRefreshStates.get(uid) !== state) {
        return;
      }

      chzzkSessionManager.updateAccessToken(uid, refreshedToken.accessToken);
      this.schedule(uid, state, refreshedToken.expiresAt);
      state.logger.info(
        { uid, expiresAt: refreshedToken.expiresAt.toISOString() },
        "Chzzk access token refreshed"
      );
    } catch (error) {
      state.logger.error({ err: error, uid }, "Chzzk access token refresh failed");

      if (error instanceof ChzzkTokenRequestError && error.status === 401) {
        this.stopAutoRefresh(uid);
        return;
      }

      this.schedule(uid, state, new Date(), RETRY_DELAY_MS);
    }
  }

  private refresh(
    uid: string,
    config: ChzzkAuthConfig
  ): Promise<StoredChzzkTokens> {
    const activeRefresh = this.refreshes.get(uid);

    if (activeRefresh) {
      return activeRefresh;
    }

    const refresh = this.performRefresh(uid, config);
    this.refreshes.set(uid, refresh);

    const clearRefresh = () => {
      if (this.refreshes.get(uid) === refresh) {
        this.refreshes.delete(uid);
      }
    };

    void refresh.then(clearRefresh, clearRefresh);

    return refresh;
  }

  private async performRefresh(
    uid: string,
    config: ChzzkAuthConfig
  ): Promise<StoredChzzkTokens> {
    const storedToken = await loadChzzkStreamerTokens(uid);

    if (!storedToken) {
      throw new Error(`No stored Chzzk token for ${uid}`);
    }

    let refreshedToken: ChzzkTokenResponse;

    try {
      refreshedToken = await refreshChzzkAccessToken(config, storedToken.refreshToken);
    } catch (error) {
      if (error instanceof ChzzkTokenRequestError && error.status === 401) {
        await markChzzkStreamerReauthenticationRequired(uid);
      }

      throw error;
    }
    await saveChzzkStreamerTokens(uid, refreshedToken);

    return {
      accessToken: refreshedToken.accessToken,
      refreshToken: refreshedToken.refreshToken,
      tokenType: refreshedToken.tokenType,
      expiresAt: new Date(Date.now() + refreshedToken.expiresIn * 1_000),
      scope: refreshedToken.scope
    };
  }
}

export function getTokenRefreshDelay(expiresAt: Date, now = Date.now()): number {
  return Math.max(0, expiresAt.getTime() - now - REFRESH_WINDOW_MS);
}

export const chzzkTokenManager = new ChzzkTokenManager();
