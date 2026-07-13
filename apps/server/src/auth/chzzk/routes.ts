import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createChzzkAuthorizationUrl,
  exchangeChzzkAuthorizationCode,
  getChzzkCurrentUser,
  getChzzkAuthConfig
} from "./client.js";
import { chzzkSessionManager } from "../../chzzk/session.js";
import { getFirebaseAuth } from "../../firebase/admin.js";
import { issueFirebaseLoginCode } from "../../firebase/login-exchange.js";
import { upsertChzzkStreamer } from "../../firebase/users.js";
import { OneTimeStore } from "../one-time-store.js";
import { getRequiredFirebaseUser, requireFirebaseUser } from "../firebase.js";

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1)
});

const pendingStates = new OneTimeStore<true>(10 * 60 * 1_000);

export async function registerChzzkAuthRoutes(app: FastifyInstance) {
  app.get("/api/auth/chzzk/start", async (_request, reply) => {
    const config = getChzzkAuthConfig();
    const state = pendingStates.issue(true);

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

    if (!pendingStates.consume(state)) {
      return reply.code(400).send({
        error: "Invalid or expired Chzzk OAuth state"
      });
    }

    const config = getChzzkAuthConfig();
    const token = await exchangeChzzkAuthorizationCode(config, code, state);
    const chzzkUser = await getChzzkCurrentUser(config, token.accessToken);
    const firebaseUid = await upsertChzzkStreamer(chzzkUser);
    const customToken = await getFirebaseAuth().createCustomToken(firebaseUid, {
      provider: "chzzk",
      chzzkChannelId: chzzkUser.channelId
    });

    try {
      await chzzkSessionManager.start(firebaseUid, config, token.accessToken, request.log);
    } catch (error) {
      request.log.error({ err: error }, "Chzzk chat session did not start after login");
    }

    const loginCode = issueFirebaseLoginCode({
      customToken,
      user: {
        uid: firebaseUid,
        chzzkChannelId: chzzkUser.channelId,
        displayName: chzzkUser.channelName
      }
    });

    request.log.info(
      {
        tokenType: token.tokenType,
        expiresIn: token.expiresIn,
        scope: token.scope
      },
      "Chzzk OAuth token exchange succeeded"
    );

    const callbackUrl = new URL("/auth/chzzk/callback", getWebAppUrl());
    callbackUrl.searchParams.set("code", loginCode);

    return reply.redirect(callbackUrl.toString());
  });

  app.get(
    "/api/chzzk/session/status",
    { preHandler: requireFirebaseUser },
    async (request) => {
      const user = getRequiredFirebaseUser(request);

      return {
        ok: true,
        session: chzzkSessionManager.getStatus(user.uid)
      };
    }
  );

  app.post(
    "/api/chzzk/session/stop",
    { preHandler: requireFirebaseUser },
    async (request) => {
      const user = getRequiredFirebaseUser(request);
      const stopped = chzzkSessionManager.stop(user.uid);

      return {
        ok: true,
        stopped,
        session: chzzkSessionManager.getStatus(user.uid)
      };
    }
  );
}

function getWebAppUrl() {
  const configuredUrl = process.env.WEB_APP_URL;

  if (configuredUrl) {
    return configuredUrl;
  }

  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:5173";
  }

  throw new Error("Missing WEB_APP_URL");
}
