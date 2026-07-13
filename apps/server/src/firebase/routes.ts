import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getFirebaseAuth, getFirestoreDb } from "./admin.js";
import { consumeFirebaseLoginCode } from "./login-exchange.js";
import { getRequiredFirebaseUser, requireFirebaseUser } from "../auth/firebase.js";

const loginExchangeBodySchema = z.object({
  code: z.string().min(1)
});

export async function registerFirebaseRoutes(app: FastifyInstance) {
  app.post("/api/auth/firebase/exchange", async (request, reply) => {
    const result = loginExchangeBodySchema.safeParse(request.body);

    if (!result.success) {
      return reply.code(400).send({
        error: "Invalid Firebase login exchange request"
      });
    }

    const exchange = consumeFirebaseLoginCode(result.data.code);

    if (!exchange) {
      return reply.code(400).send({
        error: "Invalid or expired Firebase login code"
      });
    }

    return reply
      .header("Cache-Control", "no-store")
      .send({
        ok: true,
        customToken: exchange.customToken,
        mode: exchange.mode,
        user: exchange.user
      });
  });

  app.get(
    "/api/me",
    { preHandler: requireFirebaseUser },
    async (request, reply) => {
      return reply
        .header("Cache-Control", "no-store")
        .send({
          ok: true,
          user: getRequiredFirebaseUser(request)
        });
    }
  );

  app.get("/api/firebase/status", async (request, reply) => {
    try {
      const auth = getFirebaseAuth();
      const db = getFirestoreDb();

      await Promise.all([
        auth.listUsers(1),
        db.collection("_connectionCheck").limit(1).get()
      ]);

      return {
        ok: true,
        projectId: getFirebaseAdminProjectId(),
        services: {
          authentication: true,
          firestore: true
        }
      };
    } catch (error) {
      request.log.error({ err: error }, "Firebase connection check failed");

      return reply.code(503).send({
        ok: false,
        error: "Firebase connection failed"
      });
    }
  });
}

function getFirebaseAdminProjectId() {
  return process.env.FIREBASE_PROJECT_ID ?? null;
}
