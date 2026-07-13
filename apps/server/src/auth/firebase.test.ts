import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import {
  createFirebaseAuthPreHandler,
  getRequiredFirebaseUser,
  registerFirebaseAuthentication
} from "./firebase.js";

test("Firebase auth guard rejects a request without a bearer token", async () => {
  const app = Fastify();
  await registerFirebaseAuthentication(app);

  app.get(
    "/protected",
    {
      preHandler: createFirebaseAuthPreHandler(async () => ({ uid: "unused" }))
    },
    async () => ({ ok: true })
  );

  const response = await app.inject({ method: "GET", url: "/protected" });

  assert.equal(response.statusCode, 401);
  assert.equal(response.headers["www-authenticate"], "Bearer");
  await app.close();
});

test("Firebase auth guard exposes verified user claims", async () => {
  const app = Fastify();
  await registerFirebaseAuthentication(app);

  app.get(
    "/protected",
    {
      preHandler: createFirebaseAuthPreHandler(async (token) => {
        assert.equal(token, "valid-token");

        return {
          uid: "chzzk:channel-id",
          provider: "chzzk",
          chzzkChannelId: "channel-id"
        };
      })
    },
    async (request) => ({ user: getRequiredFirebaseUser(request) })
  );

  const response = await app.inject({
    method: "GET",
    url: "/protected",
    headers: {
      authorization: "Bearer valid-token"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    user: {
      uid: "chzzk:channel-id",
      provider: "chzzk",
      chzzkChannelId: "channel-id",
      email: null
    }
  });
  await app.close();
});

test("Firebase auth guard rejects a token that fails verification", async () => {
  const app = Fastify();
  await registerFirebaseAuthentication(app);

  app.get(
    "/protected",
    {
      preHandler: createFirebaseAuthPreHandler(async () => {
        throw new Error("invalid token");
      })
    },
    async () => ({ ok: true })
  );

  const response = await app.inject({
    method: "GET",
    url: "/protected",
    headers: {
      authorization: "Bearer invalid-token"
    }
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});
