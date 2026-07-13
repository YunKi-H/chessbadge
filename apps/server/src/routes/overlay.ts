import type { FastifyInstance } from "fastify";
import type { ChatOverlayEvent } from "@chessbadge/core";
import { z } from "zod";
import { subscribeStreamerChatOverlayEvents } from "../realtime/overlay-events.js";

const testEventsQuerySchema = z.object({
  streamerUid: z.string().min(1).optional()
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
}
