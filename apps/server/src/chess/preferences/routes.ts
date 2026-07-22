import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequiredFirebaseUser, requireFirebaseUser } from "../../auth/firebase.js";
import { ratingBadgeCache } from "../badge-cache.js";
import {
  ChessBadgePreferenceError,
  getChessBadgePreference,
  updateChessBadgePreference
} from "../../firebase/chess-preferences.js";

const preferenceSchema = z.object({
  provider: z.enum(["chesscom", "lichess"])
});

export async function registerChessPreferenceRoutes(app: FastifyInstance) {
  app.get(
    "/api/chess/badge-preference",
    { preHandler: requireFirebaseUser },
    async (request, reply) => {
      const user = getRequiredFirebaseUser(request);
      if (!user.chzzkChannelId) {
        return reply.code(403).send({ error: "치지직 계정 정보가 없습니다." });
      }
      try {
        const state = await getChessBadgePreference(
          user.uid,
          user.chzzkChannelId
        );
        ratingBadgeCache.invalidate(user.chzzkChannelId);
        return { ok: true, ...state };
      } catch (error) {
        return sendPreferenceError(error, reply);
      }
    }
  );

  app.patch(
    "/api/chess/badge-preference",
    { preHandler: requireFirebaseUser },
    async (request, reply) => {
      const user = getRequiredFirebaseUser(request);
      const body = preferenceSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "표시할 체스 플랫폼이 올바르지 않습니다." });
      }
      if (!user.chzzkChannelId) {
        return reply.code(403).send({ error: "치지직 계정 정보가 없습니다." });
      }
      try {
        const state = await updateChessBadgePreference(
          user.uid,
          user.chzzkChannelId,
          body.data.provider
        );
        ratingBadgeCache.invalidate(user.chzzkChannelId);
        return { ok: true, ...state };
      } catch (error) {
        return sendPreferenceError(error, reply);
      }
    }
  );
}

function sendPreferenceError(error: unknown, reply: import("fastify").FastifyReply) {
  if (error instanceof ChessBadgePreferenceError) {
    return error.code === "badge_unavailable"
      ? reply.code(409).send({ error: "선택한 플랫폼에 표시 가능한 레이팅 배지가 없습니다." })
      : reply.code(403).send({ error: "치지직 계정 정보가 일치하지 않습니다." });
  }
  throw error;
}
