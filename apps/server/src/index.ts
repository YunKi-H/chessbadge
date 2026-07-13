import "./config/env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerChzzkAuthRoutes } from "./auth/chzzk/routes.js";
import { getChzzkAuthConfig } from "./auth/chzzk/client.js";
import { registerFirebaseAuthentication } from "./auth/firebase.js";
import { chzzkSessionService } from "./chzzk/session-service.js";
import { registerFirebaseRoutes } from "./firebase/routes.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerOverlayRoutes } from "./routes/overlay.js";

const port = Number(process.env.PORT ?? 3000);

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    serializers: {
      req: sanitizeLoggedRequest
    }
  }
});

await app.register(cors, {
  origin: true,
  credentials: true
});

await registerFirebaseAuthentication(app);

if (process.env.NODE_ENV === "production") {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const webDistDir = join(currentDir, "../../../apps/web/dist");

  await app.register(fastifyStatic, {
    root: webDistDir,
    wildcard: false
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith("/api") || request.raw.url?.startsWith("/events")) {
      reply.code(404).send({ error: "Not found" });
      return;
    }

    reply.sendFile("index.html");
  });
}

await registerHealthRoutes(app);
await registerFirebaseRoutes(app);
await registerOverlayRoutes(app);
await registerChzzkAuthRoutes(app);

await app.listen({ port, host: "0.0.0.0" });

void restoreChzzkSessions();

async function restoreChzzkSessions() {
  try {
    await chzzkSessionService.restoreEnabledSessions(
      getChzzkAuthConfig(),
      app.log
    );
  } catch (error) {
    app.log.error({ err: error }, "Chzzk session startup recovery did not run");
  }
}

function sanitizeLoggedRequest(request: { method?: string; url?: string }) {
  return {
    method: request.method,
    url: request.url?.replace(
      /(\/events\/overlay\/|\/overlay\/)[A-Za-z0-9_-]{43}/g,
      "$1[REDACTED]"
    )
  };
}
