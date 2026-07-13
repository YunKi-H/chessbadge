import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler
} from "fastify";
import { getFirebaseAuth } from "../firebase/admin.js";

export interface FirebaseRequestUser {
  uid: string;
  provider: string | null;
  chzzkChannelId: string | null;
  email: string | null;
}

interface VerifiedFirebaseToken {
  uid: string;
  provider?: unknown;
  chzzkChannelId?: unknown;
  email?: unknown;
}

type VerifyFirebaseToken = (idToken: string) => Promise<VerifiedFirebaseToken>;

declare module "fastify" {
  interface FastifyRequest {
    firebaseUser: FirebaseRequestUser | null;
  }
}

export async function registerFirebaseAuthentication(app: FastifyInstance) {
  app.decorateRequest("firebaseUser", null);
}

export const requireFirebaseUser = createFirebaseAuthPreHandler();

export function createFirebaseAuthPreHandler(
  verifyToken: VerifyFirebaseToken = verifyFirebaseIdToken
): preHandlerHookHandler {
  return async (request, reply) => {
    const idToken = extractBearerToken(request.headers.authorization);

    if (!idToken) {
      return sendUnauthorized(reply);
    }

    try {
      const decodedToken = await verifyToken(idToken);

      request.firebaseUser = {
        uid: decodedToken.uid,
        provider: stringClaim(decodedToken.provider),
        chzzkChannelId: stringClaim(decodedToken.chzzkChannelId),
        email: stringClaim(decodedToken.email)
      };
    } catch (error) {
      request.log.warn({ err: error }, "Firebase ID token rejected");
      return sendUnauthorized(reply);
    }
  };
}

export function getRequiredFirebaseUser(request: FastifyRequest): FirebaseRequestUser {
  if (!request.firebaseUser) {
    throw new Error("Firebase authentication pre-handler was not applied");
  }

  return request.firebaseUser;
}

function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseToken> {
  return getFirebaseAuth().verifyIdToken(idToken);
}

function stringClaim(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function sendUnauthorized(reply: FastifyReply) {
  return reply
    .code(401)
    .header("WWW-Authenticate", "Bearer")
    .send({ error: "Authentication required" });
}
