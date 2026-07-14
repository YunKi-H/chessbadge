import type {
  FastifyInstance,
  FastifyReply,
  preHandlerHookHandler
} from "fastify";
import { z } from "zod";
import { getRequiredFirebaseUser, requireFirebaseUser } from "../../auth/firebase.js";
import {
  ChessComClientError,
  getChessComClient,
  type ChessComClient,
  type ChessComPlayer,
  type ChessComProfile
} from "./client.js";
import {
  ChessAccountConflictError,
  getUserChessComAccount,
  saveUnverifiedChessComAccount,
  type StoredChessComAccount
} from "../../firebase/chess-accounts.js";
import {
  ChessVerificationError,
  completeChessComLocationVerification,
  createChessComLocationChallenge,
  getPendingChessComLocationChallenge,
  type ChessComVerificationChallenge,
  type PendingChessComVerification
} from "../../firebase/chess-verifications.js";
import { ratingBadgeCache } from "../badge-cache.js";
import { ensureHighestChessComBadge } from "../../firebase/chess-badges.js";

const linkBodySchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(25)
    .regex(/^[A-Za-z0-9_-]+$/)
});

export interface ChessComRouteDependencies {
  authenticate: preHandlerHookHandler;
  getPlayer(username: string): Promise<ChessComPlayer>;
  getProfile(username: string): Promise<ChessComProfile>;
  getAccount(uid: string): Promise<StoredChessComAccount | null>;
  saveAccount(uid: string, player: ChessComPlayer): Promise<StoredChessComAccount>;
  createVerification(uid: string): Promise<ChessComVerificationChallenge>;
  getPendingVerification(uid: string): Promise<PendingChessComVerification>;
  completeVerification(
    uid: string,
    accountId: string,
    playerId: string,
    location: string | null
  ): Promise<void>;
  ensureHighestBadge(uid: string, chzzkChannelId: string): Promise<boolean>;
  invalidateBadge(channelId: string): void;
}

export async function registerChessComRoutes(
  app: FastifyInstance,
  dependencies: ChessComRouteDependencies = defaultDependencies()
) {
  app.get(
    "/api/chess/chesscom/account",
    { preHandler: dependencies.authenticate },
    async (request) => {
      const user = getRequiredFirebaseUser(request);
      let account = await dependencies.getAccount(user.uid);

      if (account?.verified && !account.selectedSpeed && user.chzzkChannelId) {
        const updated = await dependencies.ensureHighestBadge(
          user.uid,
          user.chzzkChannelId
        );

        if (updated) {
          dependencies.invalidateBadge(user.chzzkChannelId);
          account = await dependencies.getAccount(user.uid);
        }
      }

      return { ok: true, account: account ? toResponse(account) : null };
    }
  );

  app.post(
    "/api/chess/chesscom/account",
    { preHandler: dependencies.authenticate },
    async (request, reply) => {
      const body = linkBodySchema.safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send({
          error: "Chess.com 사용자명 형식이 올바르지 않습니다."
        });
      }

      try {
        const player = await dependencies.getPlayer(body.data.username);
        const account = await dependencies.saveAccount(
          getRequiredFirebaseUser(request).uid,
          player
        );
        const channelId = getRequiredFirebaseUser(request).chzzkChannelId;

        if (channelId) {
          dependencies.invalidateBadge(channelId);
        }

        return reply.code(201).send({ ok: true, account: toResponse(account) });
      } catch (error) {
        return sendChessComError(error, reply);
      }
    }
  );

  app.post(
    "/api/chess/chesscom/verification",
    { preHandler: dependencies.authenticate },
    async (request, reply) => {
      try {
        const challenge = await dependencies.createVerification(
          getRequiredFirebaseUser(request).uid
        );

        return reply.code(201).send({
          ok: true,
          verification: {
            code: challenge.code,
            expiresAt: challenge.expiresAt.toISOString()
          }
        });
      } catch (error) {
        return sendChessComError(error, reply);
      }
    }
  );

  app.post(
    "/api/chess/chesscom/verification/confirm",
    { preHandler: dependencies.authenticate },
    async (request, reply) => {
      const uid = getRequiredFirebaseUser(request).uid;
      const channelId = getRequiredFirebaseUser(request).chzzkChannelId;

      try {
        const pending = await dependencies.getPendingVerification(uid);
        const profile = await dependencies.getProfile(pending.username);
        await dependencies.completeVerification(
          uid,
          pending.accountId,
          profile.playerId,
          profile.location
        );
        if (channelId) {
          dependencies.invalidateBadge(channelId);
        }
        const account = await dependencies.getAccount(uid);

        if (!account) {
          throw new ChessVerificationError("account_missing");
        }

        return { ok: true, account: toResponse(account) };
      } catch (error) {
        return sendChessComError(error, reply);
      }
    }
  );
}

function defaultDependencies(): ChessComRouteDependencies {
  let client: ChessComClient | null = null;
  const getClient = () => (client ??= getChessComClient());

  return {
    authenticate: requireFirebaseUser,
    getPlayer: (username) => getClient().getPlayer(username),
    getProfile: (username) => getClient().getProfile(username),
    getAccount: getUserChessComAccount,
    saveAccount: saveUnverifiedChessComAccount,
    createVerification: createChessComLocationChallenge,
    getPendingVerification: getPendingChessComLocationChallenge,
    completeVerification: completeChessComLocationVerification,
    ensureHighestBadge: ensureHighestChessComBadge,
    invalidateBadge: (channelId) => ratingBadgeCache.invalidate(channelId)
  };
}

function toResponse(account: StoredChessComAccount) {
  return {
    provider: "chesscom" as const,
    username: account.username,
    profileUrl: account.profileUrl,
    avatarUrl: account.avatarUrl,
    verified: account.verified,
    selectedSpeed: account.selectedSpeed,
    ratings: account.ratings
      .map((rating) => ({
        speed: rating.speed,
        value: rating.value,
        ratingDeviation: rating.ratingDeviation,
        providerUpdatedAt: rating.providerUpdatedAt.toISOString()
      }))
      .sort((left, right) => left.speed.localeCompare(right.speed))
  };
}

function sendChessComError(error: unknown, reply: FastifyReply) {
  if (error instanceof ChessAccountConflictError) {
    return reply.code(409).send({ error: "이미 다른 사용자가 연결한 계정입니다." });
  }

  if (error instanceof ChessComClientError) {
    if (error.code === "not_found") {
      return reply.code(404).send({ error: "Chess.com 계정을 찾지 못했습니다." });
    }

    if (error.code === "rate_limited") {
      return reply.code(503).send({ error: "Chess.com 요청이 많습니다. 잠시 후 다시 시도해 주세요." });
    }

    return reply.code(502).send({ error: "Chess.com 정보를 가져오지 못했습니다." });
  }

  if (error instanceof ChessVerificationError) {
    switch (error.code) {
      case "account_missing":
        return reply.code(404).send({ error: "먼저 Chess.com 계정을 등록해 주세요." });
      case "already_verified":
        return reply.code(409).send({ error: "이미 인증된 Chess.com 계정입니다." });
      case "challenge_missing":
        return reply.code(409).send({ error: "먼저 새 인증 코드를 생성해 주세요." });
      case "challenge_expired":
        return reply.code(410).send({ error: "인증 코드가 만료되었습니다. 새 코드를 생성해 주세요." });
      case "attempts_exhausted":
        return reply.code(429).send({ error: "인증 시도 횟수를 초과했습니다. 새 코드를 생성해 주세요." });
      case "identity_changed":
        return reply.code(409).send({ error: "Chess.com 계정 정보가 변경되었습니다. 계정을 다시 등록해 주세요." });
      case "location_mismatch":
        return reply.code(409).send({
          error: "Chess.com Location에서 인증 코드를 확인하지 못했습니다. 공개 API 반영에는 시간이 걸릴 수 있습니다."
        });
    }
  }

  if (error instanceof Error && error.message === "Missing CHESS_COM_USER_AGENT") {
    return reply.code(503).send({ error: "Chess.com API 설정이 완료되지 않았습니다." });
  }

  throw error;
}
