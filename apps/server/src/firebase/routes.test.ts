import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerFirebaseAuthentication } from "../auth/firebase.js";
import { issueFirebaseLoginCode } from "./login-exchange.js";
import { registerFirebaseRoutes } from "./routes.js";

test("Firebase login exchange returns the Chzzk login mode", async () => {
  const app = Fastify();
  await registerFirebaseAuthentication(app);
  await registerFirebaseRoutes(app);

  const code = issueFirebaseLoginCode({
    customToken: "custom-token",
    mode: "viewer",
    user: {
      uid: "chzzk:channel-id",
      chzzkChannelId: "channel-id",
      displayName: "viewer"
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/auth/firebase/exchange",
    payload: { code }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    customToken: "custom-token",
    mode: "viewer",
    user: {
      uid: "chzzk:channel-id",
      chzzkChannelId: "channel-id",
      displayName: "viewer"
    }
  });
  await app.close();
});
