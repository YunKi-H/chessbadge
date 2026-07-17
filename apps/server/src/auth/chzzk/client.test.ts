import assert from "node:assert/strict";
import test from "node:test";
import {
  ChzzkTokenRequestError,
  getChzzkUserSessions,
  refreshChzzkAccessToken,
  revokeChzzkToken,
  type ChzzkAuthConfig
} from "./client.js";

const config: ChzzkAuthConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost/callback",
  openApiBaseUrl: "https://openapi.example.com"
};

test("Chzzk token refresh sends the one-time refresh token", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: unknown;

  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));

    return new Response(
      JSON.stringify({
        content: {
          accessToken: "new-access-token",
          refreshToken: "new-refresh-token",
          tokenType: "Bearer",
          expiresIn: "86400",
          scope: "chat"
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const token = await refreshChzzkAccessToken(config, "old-refresh-token");

    assert.deepEqual(requestBody, {
      grantType: "refresh_token",
      refreshToken: "old-refresh-token",
      clientId: "client-id",
      clientSecret: "client-secret"
    });
    assert.equal(token.accessToken, "new-access-token");
    assert.equal(token.refreshToken, "new-refresh-token");
    assert.equal(token.expiresIn, 86400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Chzzk token errors preserve the API error code and message", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ code: 401, message: "INVALID_TOKEN" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });

  try {
    await assert.rejects(
      revokeChzzkToken(config, "expired-token", "refresh_token"),
      (error) => {
        assert.ok(error instanceof ChzzkTokenRequestError);
        assert.equal(error.errorCode, "401");
        assert.equal(error.responseMessage, "INVALID_TOKEN");
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Chzzk token revocation sends the refresh token and app credentials", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestBody: unknown;

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return new Response(null, { status: 204 });
  };

  try {
    await revokeChzzkToken(config, "refresh-token", "refresh_token");

    assert.equal(
      requestedUrl,
      "https://openapi.example.com/auth/v1/token/revoke"
    );
    assert.deepEqual(requestBody, {
      clientId: "client-id",
      clientSecret: "client-secret",
      token: "refresh-token",
      tokenTypeHint: "refresh_token"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Chzzk session list preserves connection and subscription state", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = async (input) => {
    requestedUrl = String(input);

    return new Response(
      JSON.stringify({
        content: {
          data: [
            {
              sessionKey: "session-key",
              connectedDate: "2026-07-15T00:00:00Z",
              disconnectedDate: null,
              subscribedEvents: [
                { eventType: "CHAT", channelId: "channel-id" }
              ]
            }
          ]
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const sessions = await getChzzkUserSessions(config, "access-token");

    assert.match(requestedUrl, /\/open\/v1\/sessions\?size=50&page=0$/);
    assert.deepEqual(sessions, [
      {
        sessionKey: "session-key",
        connectedDate: "2026-07-15T00:00:00Z",
        disconnectedDate: null,
        subscribedEvents: [
          { eventType: "CHAT", channelId: "channel-id" }
        ]
      }
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
