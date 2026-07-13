import type { FastifyInstance } from "fastify";
import type { ChatOverlayEvent } from "@chessbadge/core";
import { z } from "zod";
import { getRequiredFirebaseUser, requireFirebaseUser } from "../auth/firebase.js";
import { getWebAppUrl } from "../config/web.js";
import {
  disableStreamerOverlayAccess,
  enableStreamerOverlayAccess,
  getStreamerOverlayAccess,
  resolveActiveOverlayStreamer,
  rotateStreamerOverlayAccess,
  StreamerOverlayAccessError,
  type StreamerOverlayAccess
} from "../firebase/overlays.js";
import {
  revokeOverlayConnections,
  subscribeOverlayRevocation
} from "../realtime/overlay-access-events.js";
import { subscribeStreamerChatOverlayEvents } from "../realtime/overlay-events.js";

const testEventsQuerySchema = z.object({
  streamerUid: z.string().min(1).optional()
});

const overlayParamsSchema = z.object({
  publicToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
});

const sampleEvent: ChatOverlayEvent = {
  id: "sample-1",
  nickname: "yunki",
  content: "좋은 수네요",
  rating: {
    provider: "lichess",
    speed: "blitz",
    value: 1520,
    provisional: false
  },
  sentAt: new Date().toISOString()
};

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

  app.get("/api/overlay/test/messages", async () => ({
    messages: [sampleEvent]
  }));

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

    send(sampleEvent);

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
    const streamerUid = await resolveActiveOverlayStreamer(publicToken);

    if (!streamerUid) {
      return reply.code(404).send({ error: "Overlay not found" });
    }

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

    let closed = false;
    let validating = false;
    const unsubscribeChat = subscribeStreamerChatOverlayEvents(streamerUid, send);
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

      if (!validating) {
        validating = true;
        void resolveActiveOverlayStreamer(publicToken)
          .then((activeStreamerUid) => {
            if (activeStreamerUid !== streamerUid && !closed) {
              reply.raw.end();
            }
          })
          .catch((error: unknown) => {
            request.log.warn({ err: error }, "Overlay access revalidation failed");
          })
          .finally(() => {
            validating = false;
          });
      }
    }, 15_000);

    const cleanup = () => {
      if (closed) {
        return;
      }

      closed = true;
      unsubscribeChat();
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
    url: new URL(`/overlay/${overlay.publicToken}`, getWebAppUrl()).toString()
  };
}

function sendOverlayManagementError(error: unknown, reply: import("fastify").FastifyReply) {
  if (error instanceof StreamerOverlayAccessError) {
    return reply.code(403).send({ error: error.message });
  }

  throw error;
}
