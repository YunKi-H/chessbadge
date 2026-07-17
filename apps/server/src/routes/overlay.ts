import type { FastifyInstance } from "fastify";
import {
  DEFAULT_OVERLAY_APPEARANCE,
  OVERLAY_FONT_FAMILY_VALUES,
  type ChatOverlayEvent,
  type OverlayAppearance
} from "@elobadge/core";
import { z } from "zod";
import { getRequiredFirebaseUser, requireFirebaseUser } from "../auth/firebase.js";
import { getWebAppUrl } from "../config/web.js";
import {
  disableStreamerOverlayAccess,
  enableStreamerOverlayAccess,
  getStreamerOverlayAccess,
  resolveActiveOverlayAccess,
  rotateStreamerOverlayAccess,
  StreamerOverlayAccessError,
  updateStreamerOverlayAppearance,
  type StreamerOverlayAccess
} from "../firebase/overlays.js";
import {
  publishOverlayAppearance,
  revokeOverlayConnections,
  subscribeOverlayAppearance,
  subscribeOverlayRevocation
} from "../realtime/overlay-access-events.js";
import { subscribeStreamerChatOverlayEvents } from "../realtime/overlay-events.js";

const testEventsQuerySchema = z.object({
  streamerUid: z.string().min(1).optional()
});

const overlayParamsSchema = z.object({
  publicToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
});

const overlayAppearanceSchema = z.object({
  backgroundVisible: z.boolean(),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  backgroundOpacity: z.number().int().min(0).max(100),
  chzzkBadgesVisible: z.boolean().default(true),
  chzzkBadgeVisibility: z.object({
    role: z.boolean(),
    subscription: z.boolean(),
    donation: z.boolean(),
    subscription_gift: z.boolean(),
    unknown: z.boolean()
  }).default({
    role: true,
    subscription: true,
    donation: true,
    subscription_gift: true,
    unknown: true
  }),
  nicknameVisible: z.boolean(),
  nicknameColorMode: z.enum(["fixed", "by_user", "by_role"]),
  nicknameColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  nicknameRoleColors: z.object({
    streamer: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    manager: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    donator: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    subscriber: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    viewer: z.string().regex(/^#[0-9A-Fa-f]{6}$/)
  }),
  messageColorMode: z.enum(["fixed", "by_role"]).default("fixed"),
  messageColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  messageRoleColors: z.object({
    streamer: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    manager: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    donator: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    subscriber: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    viewer: z.string().regex(/^#[0-9A-Fa-f]{6}$/)
  }).default(DEFAULT_OVERLAY_APPEARANCE.messageRoleColors),
  fontFamily: z.enum(OVERLAY_FONT_FAMILY_VALUES).default("system"),
  fontSizePx: z.number().int().min(12).max(36).default(18),
  fontWeight: z.union([
    z.literal(400),
    z.literal(500),
    z.literal(600),
    z.literal(700),
    z.literal(900)
  ]).default(400),
  fontLineHeight: z.union([
    z.literal(1.2),
    z.literal(1.4),
    z.literal(1.6)
  ]).default(1.4),
  messageDurationSeconds: z.union([
    z.literal(0),
    z.literal(10),
    z.literal(20),
    z.literal(30),
    z.literal(60)
  ]).default(20)
});

export async function registerOverlayRoutes(app: FastifyInstance) {
  app.get(
    "/api/overlay",
    { preHandler: requireFirebaseUser },
    async (request) => {
      const user = getRequiredFirebaseUser(request);
      const overlay = await getStreamerOverlayAccess(user.uid);

      return { ok: true, overlay: overlay ? toOverlayResponse(overlay) : null };
    }
  );

  app.post(
    "/api/overlay",
    { preHandler: requireFirebaseUser },
    async (request, reply) => {
      const user = getRequiredFirebaseUser(request);

      try {
        const overlay = await enableStreamerOverlayAccess(user.uid);
        return reply.code(201).send({ ok: true, overlay: toOverlayResponse(overlay) });
      } catch (error) {
        return sendOverlayManagementError(error, reply);
      }
    }
  );

  app.post(
    "/api/overlay/rotate",
    { preHandler: requireFirebaseUser },
    async (request, reply) => {
      const user = getRequiredFirebaseUser(request);

      try {
        const previous = await getStreamerOverlayAccess(user.uid);
        const overlay = await rotateStreamerOverlayAccess(user.uid);

        if (previous) {
          revokeOverlayConnections(previous.publicToken);
        }

        return { ok: true, overlay: toOverlayResponse(overlay) };
      } catch (error) {
        return sendOverlayManagementError(error, reply);
      }
    }
  );

  app.post(
    "/api/overlay/disable",
    { preHandler: requireFirebaseUser },
    async (request, reply) => {
      const user = getRequiredFirebaseUser(request);

      try {
        const publicToken = await disableStreamerOverlayAccess(user.uid);

        if (publicToken) {
          revokeOverlayConnections(publicToken);
        }

        const overlay = await getStreamerOverlayAccess(user.uid);
        return { ok: true, overlay: overlay ? toOverlayResponse(overlay) : null };
      } catch (error) {
        return sendOverlayManagementError(error, reply);
      }
    }
  );

  app.patch(
    "/api/overlay/appearance",
    { preHandler: requireFirebaseUser },
    async (request, reply) => {
      const user = getRequiredFirebaseUser(request);
      const parsedAppearance = overlayAppearanceSchema.safeParse(request.body);

      if (!parsedAppearance.success) {
        return reply.code(400).send({ error: "Invalid overlay appearance" });
      }

      const appearance: OverlayAppearance = {
        ...parsedAppearance.data,
        backgroundColor: parsedAppearance.data.backgroundColor.toUpperCase(),
        nicknameColor: parsedAppearance.data.nicknameColor.toUpperCase(),
        nicknameRoleColors: Object.fromEntries(
          Object.entries(parsedAppearance.data.nicknameRoleColors).map(
            ([kind, color]) => [kind, color.toUpperCase()]
          )
        ) as OverlayAppearance["nicknameRoleColors"],
        messageColor: parsedAppearance.data.messageColor.toUpperCase(),
        messageRoleColors: Object.fromEntries(
          Object.entries(parsedAppearance.data.messageRoleColors).map(
            ([kind, color]) => [kind, color.toUpperCase()]
          )
        ) as OverlayAppearance["messageRoleColors"]
      };

      try {
        const overlay = await updateStreamerOverlayAppearance(user.uid, appearance);
        publishOverlayAppearance(overlay.publicToken, appearance);
        return { ok: true, overlay: toOverlayResponse(overlay) };
      } catch (error) {
        return sendOverlayManagementError(error, reply);
      }
    }
  );

  app.get("/events/test", async (request, reply) => {
    const query = testEventsQuerySchema.parse(request.query);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });

    const send = (event: ChatOverlayEvent) => {
      reply.raw.write(`event: chat\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const unsubscribe = query.streamerUid
      ? subscribeStreamerChatOverlayEvents(query.streamerUid, send)
      : () => {};

    const heartbeat = setInterval(() => {
      reply.raw.write(`event: heartbeat\n`);
      reply.raw.write(`data: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    }, 15000);

    request.raw.on("close", () => {
      unsubscribe();
      clearInterval(heartbeat);
    });
  });

  app.get("/events/overlay/:publicToken", async (request, reply) => {
    const parsedParams = overlayParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.code(404).send({ error: "Overlay not found" });
    }

    const { publicToken } = parsedParams.data;
    const activeOverlay = await resolveActiveOverlayAccess(publicToken);

    if (!activeOverlay) {
      return reply.code(404).send({ error: "Overlay not found" });
    }

    const { streamerUid } = activeOverlay;

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });

    const send = (event: ChatOverlayEvent) => {
      reply.raw.write(`event: chat\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const sendAppearance = (appearance: OverlayAppearance) => {
      reply.raw.write("event: appearance\n");
      reply.raw.write(`data: ${JSON.stringify(appearance)}\n\n`);
    };

    let closed = false;
    sendAppearance(activeOverlay.appearance);
    const unsubscribeChat = subscribeStreamerChatOverlayEvents(streamerUid, send);
    const unsubscribeAppearance = subscribeOverlayAppearance(
      publicToken,
      sendAppearance
    );
    const unsubscribeRevocation = subscribeOverlayRevocation(publicToken, () => {
      if (!closed) {
        reply.raw.write("event: revoked\ndata: {}\n\n");
        reply.raw.end();
      }
    });

    const heartbeat = setInterval(() => {
      if (closed) {
        return;
      }

      reply.raw.write(`event: heartbeat\n`);
      reply.raw.write(`data: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    }, 15_000);

    const cleanup = () => {
      if (closed) {
        return;
      }

      closed = true;
      unsubscribeChat();
      unsubscribeAppearance();
      unsubscribeRevocation();
      clearInterval(heartbeat);
    };

    request.raw.on("close", cleanup);
    reply.raw.on("close", cleanup);
  });
}

function toOverlayResponse(overlay: StreamerOverlayAccess) {
  return {
    publicToken: overlay.publicToken,
    active: overlay.active,
    appearance: overlay.appearance,
    url: new URL(`/overlay/${overlay.publicToken}`, getWebAppUrl()).toString()
  };
}

function sendOverlayManagementError(error: unknown, reply: import("fastify").FastifyReply) {
  if (error instanceof StreamerOverlayAccessError) {
    return reply.code(403).send({ error: error.message });
  }

  throw error;
}
