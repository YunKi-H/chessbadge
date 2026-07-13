import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerFirebaseAuthentication } from "../auth/firebase.js";
import { registerOverlayRoutes } from "./overlay.js";

test("overlay management requires Firebase authentication", async () => {
  const app = Fastify();
  await registerFirebaseAuthentication(app);
  await registerOverlayRoutes(app);

  const response = await app.inject({ method: "GET", url: "/api/overlay" });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test("public overlay events reject malformed access tokens", async () => {
  const app = Fastify();
  await registerFirebaseAuthentication(app);
  await registerOverlayRoutes(app);

  const response = await app.inject({
    method: "GET",
    url: "/events/overlay/not-a-valid-token"
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: "Overlay not found" });
  await app.close();
});
