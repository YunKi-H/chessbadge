import type { FastifyInstance } from "fastify";
import type { ChatOverlayEvent } from "@chessbadge/core";

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

  app.get("/events/test", async (_request, reply) => {
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

    const interval = setInterval(() => {
      send({
        ...sampleEvent,
        id: crypto.randomUUID(),
        sentAt: new Date().toISOString()
      });
    }, 5000);

    _request.raw.on("close", () => {
      clearInterval(interval);
    });
  });
}
