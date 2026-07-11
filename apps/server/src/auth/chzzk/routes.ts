import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createChzzkAuthorizationUrl,
  exchangeChzzkAuthorizationCode,
  getChzzkAuthConfig
} from "./client.js";
import { chzzkSessionManager } from "../../chzzk/session.js";

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1)
});

const pendingStates = new Set<string>();

export async function registerChzzkAuthRoutes(app: FastifyInstance) {
  app.get("/api/auth/chzzk/start", async (_request, reply) => {
    const config = getChzzkAuthConfig();
    const state = randomBytes(24).toString("base64url");

    pendingStates.add(state);

    return reply.redirect(createChzzkAuthorizationUrl(config, state).toString());
  });

  app.get("/api/auth/chzzk/callback", async (request, reply) => {
    const result = callbackQuerySchema.safeParse(request.query);

    if (!result.success) {
      return reply.code(400).send({
        error: "Invalid Chzzk OAuth callback query"
      });
    }

    const { code, state } = result.data;

    if (!consumeState(state)) {
      return reply.code(400).send({
        error: "Invalid or expired Chzzk OAuth state"
      });
    }

    const config = getChzzkAuthConfig();
    const token = await exchangeChzzkAuthorizationCode(config, code, state);
    const sessionStatus = await chzzkSessionManager.start(
      config,
      token.accessToken,
      request.log
    );

    request.log.info(
      {
        tokenType: token.tokenType,
        expiresIn: token.expiresIn,
        scope: token.scope
      },
      "Chzzk OAuth token exchange succeeded"
    );

    return reply.send({
      ok: true,
      provider: "chzzk",
      tokenType: token.tokenType,
      expiresIn: token.expiresIn,
      scope: token.scope,
      accessTokenPreview: maskToken(token.accessToken),
      refreshTokenPreview: maskToken(token.refreshToken),
      session: sessionStatus
    });
  });

  app.get("/api/chzzk/session/status", async () => ({
    ok: true,
    session: chzzkSessionManager.getStatus()
  }));

  app.post("/api/chzzk/session/stop", async () => {
    chzzkSessionManager.stop();

    return {
      ok: true,
      session: chzzkSessionManager.getStatus()
    };
  });
}

function consumeState(state: string) {
  for (const pendingState of pendingStates) {
    const pending = Buffer.from(pendingState);
    const received = Buffer.from(state);

    if (pending.length === received.length && timingSafeEqual(pending, received)) {
      pendingStates.delete(pendingState);
      return true;
    }
  }

  return false;
}

function maskToken(token: string) {
  if (token.length <= 12) {
    return "***";
  }

  return `${token.slice(0, 6)}...${token.slice(-6)}`;
}
