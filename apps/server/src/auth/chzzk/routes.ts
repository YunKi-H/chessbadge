import type { FastifyInstance } from "fastify";
import type { ChzzkLoginMode } from "@chessbadge/core";
import { z } from "zod";
import {
  createChzzkAuthorizationUrl,
  exchangeChzzkAuthorizationCode,
  getChzzkCurrentUser,
  getChzzkAuthConfig
} from "./client.js";
import { chzzkSessionService } from "../../chzzk/session-service.js";
import { getFirebaseAuth } from "../../firebase/admin.js";
import { saveChzzkStreamerTokens } from "../../firebase/chzzk-tokens.js";
import { issueFirebaseLoginCode } from "../../firebase/login-exchange.js";
import {
  registerChzzkStreamer,
  upsertChzzkUser
} from "../../firebase/users.js";
import { OneTimeStore } from "../one-time-store.js";
import { getRequiredFirebaseUser, requireFirebaseUser } from "../firebase.js";

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1)
});

const startQuerySchema = z.object({
  mode: z.enum(["streamer", "viewer"])
});

const pendingStates = new OneTimeStore<{ mode: ChzzkLoginMode }>(10 * 60 * 1_000);

export async function registerChzzkAuthRoutes(app: FastifyInstance) {
  app.get("/api/auth/chzzk/start", async (request, reply) => {
    const result = startQuerySchema.safeParse(request.query);

    if (!result.success) {
      return reply.code(400).send({
        error: "A valid Chzzk login mode is required",
        modes: ["streamer", "viewer"]
      });
    }

    const config = getChzzkAuthConfig();
    const state = pendingStates.issue({ mode: result.data.mode });

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

    const pendingLogin = pendingStates.consume(state);

    if (!pendingLogin) {
      return reply.code(400).send({
        error: "Invalid or expired Chzzk OAuth state"
      });
    }

    const config = getChzzkAuthConfig();
    const token = await exchangeChzzkAuthorizationCode(config, code, state);
    const chzzkUser = await getChzzkCurrentUser(config, token.accessToken);
    const firebaseUid = await upsertChzzkUser(chzzkUser);

    if (pendingLogin.mode === "streamer") {
      await registerChzzkStreamer(firebaseUid, chzzkUser);
      await saveChzzkStreamerTokens(firebaseUid, token);
    }

    const customToken = await getFirebaseAuth().createCustomToken(firebaseUid, {
      provider: "chzzk",
      chzzkChannelId: chzzkUser.channelId
    });

    if (pendingLogin.mode === "streamer") {
      try {
        await chzzkSessionService.startAfterLogin(
          firebaseUid,
          config,
          token.accessToken,
          request.log
        );
      } catch (error) {
        request.log.error({ err: error }, "Chzzk chat session did not start after login");
      }
    }

    // Viewer credentials are used only for identity lookup and are never persisted.

    const loginCode = issueFirebaseLoginCode({
      customToken,
      mode: pendingLogin.mode,
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
        scope: token.scope,
        mode: pendingLogin.mode
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
        session: chzzkSessionService.getStatus(user.uid)
      };
    }
  );

  app.post(
    "/api/chzzk/session/stop",
    { preHandler: requireFirebaseUser },
    async (request) => {
      const user = getRequiredFirebaseUser(request);
      const stopped = await chzzkSessionService.stop(user.uid);

      return {
        ok: true,
        stopped,
        session: chzzkSessionService.getStatus(user.uid)
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
