import type { FastifyInstance, FastifyReply, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { getRequiredFirebaseUser, requireFirebaseUser } from "../../auth/firebase.js";
import { OneTimeStore } from "../../auth/one-time-store.js";
import { getWebAppUrl } from "../../config/web.js";
import {
  disconnectLichessAccount,
  getUserLichessAccount,
  LichessAccountConflictError,
  LichessRefreshError,
  refreshLichessAccount,
  saveVerifiedLichessAccount,
  type StoredLichessAccount
} from "../../firebase/lichess-accounts.js";
import { ratingBadgeCache } from "../badge-cache.js";
import {
  createLichessAuthorizationUrl,
  createLichessClient,
  createLichessCodeChallenge,
  createLichessPkceVerifier,
  getLichessAuthConfig,
  LichessClientError,
  type LichessClient,
  type LichessPlayer
} from "./client.js";

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1)
});

interface PendingLichessConnection {
  uid: string;
  chzzkChannelId: string;
  codeVerifier: string;
}

const pendingConnections = new OneTimeStore<PendingLichessConnection>(10 * 60 * 1_000);

export interface LichessRouteDependencies {
  authenticate: preHandlerAsyncHookHandler;
  issueState(value: PendingLichessConnection): string;
  consumeState(state: string): PendingLichessConnection | null;
  createVerifier(): string;
  createAuthorizationUrl(state: string, challenge: string): URL;
  exchangeCode(code: string, verifier: string): Promise<string>;
  getCurrentPlayer(accessToken: string): Promise<LichessPlayer>;
  getPlayer(username: string): Promise<LichessPlayer>;
  revokeToken(accessToken: string): Promise<void>;
  getAccount(uid: string): Promise<StoredLichessAccount | null>;
  saveAccount(uid: string, channelId: string, player: LichessPlayer): Promise<StoredLichessAccount>;
  refreshAccount(uid: string, channelId: string): Promise<StoredLichessAccount>;
  disconnectAccount(uid: string, channelId: string): Promise<boolean>;
  invalidateBadge(channelId: string): void;
  webAppUrl(): string;
}

export async function registerLichessRoutes(
  app: FastifyInstance,
  dependencies: LichessRouteDependencies = defaultDependencies()
) {
  app.get(
    "/api/chess/lichess/account",
    { preHandler: dependencies.authenticate },
    async (request) => ({
      ok: true,
      account: toResponse(await dependencies.getAccount(getRequiredFirebaseUser(request).uid))
    })
  );

  app.post(
    "/api/auth/lichess/start",
    {
      preHandler: dependencies.authenticate,
      config: { rateLimit: { max: 10, timeWindow: "10 minutes" } }
    },
    async (request, reply) => {
      const user = getRequiredFirebaseUser(request);
      if (!user.chzzkChannelId) {
        return reply.code(403).send({ error: "치지직 계정 정보가 없습니다." });
      }

      const verifier = dependencies.createVerifier();
      const state = dependencies.issueState({
        uid: user.uid,
        chzzkChannelId: user.chzzkChannelId,
        codeVerifier: verifier
      });
      const authorizationUrl = dependencies.createAuthorizationUrl(
        state,
        createLichessCodeChallenge(verifier)
      );
      return { ok: true, authorizationUrl: authorizationUrl.toString() };
    }
  );

  app.get(
    "/api/auth/lichess/callback",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const result = callbackQuerySchema.safeParse(request.query);
      if (!result.success) {
        return redirectToViewer(reply, dependencies.webAppUrl(), "error");
      }

      const pending = dependencies.consumeState(result.data.state);
      if (!pending) {
        return redirectToViewer(reply, dependencies.webAppUrl(), "expired");
      }

      let accessToken: string | null = null;
      try {
        accessToken = await dependencies.exchangeCode(
          result.data.code,
          pending.codeVerifier
        );
        const player = await dependencies.getCurrentPlayer(accessToken);
        await dependencies.saveAccount(
          pending.uid,
          pending.chzzkChannelId,
          player
        );
        dependencies.invalidateBadge(pending.chzzkChannelId);
        request.log.info(
          { uid: pending.uid, lichessUserId: player.playerId },
          "Lichess account connected"
        );
        return redirectToViewer(reply, dependencies.webAppUrl(), "connected");
      } catch (error) {
        request.log.warn({ err: error, uid: pending.uid }, "Lichess account connection failed");
        return redirectToViewer(reply, dependencies.webAppUrl(), "error");
      } finally {
        if (accessToken) {
          try {
            await dependencies.revokeToken(accessToken);
          } catch (error) {
            request.log.warn({ err: error, uid: pending.uid }, "Temporary Lichess token revocation failed");
          }
        }
      }
    }
  );

  app.post(
    "/api/chess/lichess/account/refresh",
    { preHandler: dependencies.authenticate },
    async (request, reply) => {
      const user = getRequiredFirebaseUser(request);
      if (!user.chzzkChannelId) {
        return reply.code(403).send({ error: "치지직 계정 정보가 없습니다." });
      }
      try {
        const account = await dependencies.refreshAccount(user.uid, user.chzzkChannelId);
        dependencies.invalidateBadge(user.chzzkChannelId);
        return { ok: true, account: toResponse(account) };
      } catch (error) {
        return sendLichessError(error, reply);
      }
    }
  );

  app.delete(
    "/api/chess/lichess/account",
    { preHandler: dependencies.authenticate },
    async (request, reply) => {
      const user = getRequiredFirebaseUser(request);
      if (!user.chzzkChannelId) {
        return reply.code(403).send({ error: "치지직 계정 정보가 없습니다." });
      }
      const disconnected = await dependencies.disconnectAccount(
        user.uid,
        user.chzzkChannelId
      );
      if (!disconnected) {
        return reply.code(404).send({ error: "연결된 Lichess 계정이 없습니다." });
      }
      dependencies.invalidateBadge(user.chzzkChannelId);
      return { ok: true, account: null };
    }
  );
}

function defaultDependencies(): LichessRouteDependencies {
  let client: LichessClient | null = null;
  const getClient = () => (client ??= createLichessClient(getLichessAuthConfig()));

  return {
    authenticate: requireFirebaseUser,
    issueState: (value) => pendingConnections.issue(value),
    consumeState: (state) => pendingConnections.consume(state),
    createVerifier: createLichessPkceVerifier,
    createAuthorizationUrl: (state, challenge) =>
      createLichessAuthorizationUrl(getLichessAuthConfig(), state, challenge),
    exchangeCode: async (code, verifier) =>
      (await getClient().exchangeCode(code, verifier)).accessToken,
    getCurrentPlayer: (token) => getClient().getCurrentPlayer(token),
    getPlayer: (username) => getClient().getPlayer(username),
    revokeToken: (token) => getClient().revokeToken(token),
    getAccount: getUserLichessAccount,
    saveAccount: saveVerifiedLichessAccount,
    refreshAccount: (uid, channelId) =>
      refreshLichessAccount(uid, channelId, (username) => getClient().getPlayer(username)),
    disconnectAccount: disconnectLichessAccount,
    invalidateBadge: (channelId) => ratingBadgeCache.invalidate(channelId),
    webAppUrl: getWebAppUrl
  };
}

function toResponse(account: StoredLichessAccount | null) {
  if (!account) {
    return null;
  }
  return {
    provider: "lichess" as const,
    username: account.username,
    profileUrl: account.profileUrl,
    verified: true,
    selectedSpeed: account.selectedSpeed,
    ratingsFetchedAt: account.ratingsFetchedAt?.toISOString() ?? null,
    manualRefreshAvailableAt: account.manualRefreshAvailableAt?.toISOString() ?? null,
    ratings: account.ratings
      .map((rating) => ({
        speed: rating.speed,
        value: rating.value,
        ratingDeviation: rating.ratingDeviation,
        provisional: rating.provisional,
        games: rating.games
      }))
      .sort((left, right) => left.speed.localeCompare(right.speed))
  };
}

function redirectToViewer(reply: FastifyReply, webAppUrl: string, result: string) {
  const url = new URL("/viewer", webAppUrl);
  url.searchParams.set("lichess", result);
  return reply.redirect(url.toString());
}

function sendLichessError(error: unknown, reply: FastifyReply) {
  if (error instanceof LichessAccountConflictError) {
    return reply.code(409).send({ error: "이미 다른 사용자가 연결한 Lichess 계정입니다." });
  }
  if (error instanceof LichessRefreshError) {
    if (error.code === "account_missing") {
      return reply.code(404).send({ error: "연결된 Lichess 계정이 없습니다." });
    }
    if (error.code === "identity_changed") {
      return reply.code(409).send({ error: "Lichess 계정 식별자가 변경되었습니다. 다시 연결해 주세요." });
    }
    const retryAfter = error.retryAt
      ? Math.max(1, Math.ceil((error.retryAt.getTime() - Date.now()) / 1_000))
      : 300;
    return reply.header("Retry-After", String(retryAfter)).code(429).send({
      error: "레이팅은 5분에 한 번만 직접 갱신할 수 있습니다.",
      retryAt: error.retryAt?.toISOString() ?? null
    });
  }
  if (error instanceof LichessClientError) {
    if (error.code === "not_found") {
      return reply.code(404).send({ error: "Lichess 계정을 찾지 못했습니다." });
    }
    if (error.code === "rate_limited") {
      return reply.code(503).send({ error: "Lichess 요청이 많습니다. 잠시 후 다시 시도해 주세요." });
    }
    return reply.code(502).send({ error: "Lichess 정보를 가져오지 못했습니다." });
  }
  throw error;
}
