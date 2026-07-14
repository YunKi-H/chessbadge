import { z } from "zod";

const CHZZK_REQUEST_TIMEOUT_MS = 10_000;

const tokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.string(),
  expiresIn: z.coerce.number().positive(),
  scope: z.string().optional()
});

const sessionResponseSchema = z.object({
  url: z.string().url()
});

const userResponseSchema = z.object({
  channelId: z.string().min(1),
  channelName: z.string().min(1)
});

const sessionListResponseSchema = z.object({
  data: z.array(
    z.object({
      sessionKey: z.string(),
      connectedDate: z.string(),
      disconnectedDate: z.string().nullable().optional(),
      subscribedEvents: z.array(
        z.object({
          eventType: z.string(),
          channelId: z.string().optional()
        })
      )
    })
  )
});

export interface ChzzkAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  openApiBaseUrl: string;
}

export interface ChzzkTokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  scope: string | null;
}

export interface ChzzkSessionResponse {
  url: string;
}

export interface ChzzkUserResponse {
  channelId: string;
  channelName: string;
}

export interface ChzzkUserSession {
  sessionKey: string;
  connectedDate: string;
  disconnectedDate: string | null;
  subscribedEvents: Array<{
    eventType: string;
    channelId: string | null;
  }>;
}

export class ChzzkTokenRequestError extends Error {
  constructor(readonly status: number) {
    super(`Chzzk token request failed with status ${status}`);
    this.name = "ChzzkTokenRequestError";
  }
}

export function getChzzkAuthConfig(): ChzzkAuthConfig {
  const clientId = process.env.CHZZK_CLIENT_ID;
  const clientSecret = process.env.CHZZK_CLIENT_SECRET;
  const redirectUri = process.env.CHZZK_REDIRECT_URI;
  const openApiBaseUrl =
    process.env.CHZZK_OPEN_API_BASE_URL ?? "https://openapi.chzzk.naver.com";

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing CHZZK_CLIENT_ID, CHZZK_CLIENT_SECRET, or CHZZK_REDIRECT_URI"
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    openApiBaseUrl
  };
}

export function createChzzkAuthorizationUrl(config: ChzzkAuthConfig, state: string) {
  const url = new URL("https://chzzk.naver.com/account-interlock");
  url.searchParams.set("clientId", config.clientId);
  url.searchParams.set("redirectUri", config.redirectUri);
  url.searchParams.set("state", state);
  return url;
}

export async function exchangeChzzkAuthorizationCode(
  config: ChzzkAuthConfig,
  code: string,
  state: string
): Promise<ChzzkTokenResponse> {
  return requestChzzkToken(config, {
    grantType: "authorization_code",
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    code,
    state
  });
}

export async function refreshChzzkAccessToken(
  config: ChzzkAuthConfig,
  refreshToken: string
): Promise<ChzzkTokenResponse> {
  return requestChzzkToken(config, {
    grantType: "refresh_token",
    refreshToken,
    clientId: config.clientId,
    clientSecret: config.clientSecret
  });
}

async function requestChzzkToken(
  config: ChzzkAuthConfig,
  requestBody: Record<string, string>
): Promise<ChzzkTokenResponse> {
  const response = await fetch(`${config.openApiBaseUrl}/auth/v1/token`, {
    method: "POST",
    signal: AbortSignal.timeout(CHZZK_REQUEST_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ChzzkTokenRequestError(response.status);
  }

  const content = unwrapChzzkContent(body);
  const parsed = tokenResponseSchema.parse(content);

  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    tokenType: parsed.tokenType,
    expiresIn: parsed.expiresIn,
    scope: parsed.scope ?? null
  };
}

export async function createChzzkUserSession(
  config: ChzzkAuthConfig,
  accessToken: string
): Promise<ChzzkSessionResponse> {
  const response = await fetch(`${config.openApiBaseUrl}/open/v1/sessions/auth`, {
    method: "GET",
    signal: AbortSignal.timeout(CHZZK_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Chzzk session request failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return sessionResponseSchema.parse(unwrapChzzkContent(body));
}

export async function getChzzkCurrentUser(
  config: ChzzkAuthConfig,
  accessToken: string
): Promise<ChzzkUserResponse> {
  const response = await fetch(`${config.openApiBaseUrl}/open/v1/users/me`, {
    method: "GET",
    signal: AbortSignal.timeout(CHZZK_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Chzzk user request failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return userResponseSchema.parse(unwrapChzzkContent(body));
}

export async function subscribeChzzkChatEvent(
  config: ChzzkAuthConfig,
  accessToken: string,
  sessionKey: string
) {
  const url = new URL(`${config.openApiBaseUrl}/open/v1/sessions/events/subscribe/chat`);
  url.searchParams.set("sessionKey", sessionKey);

  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(CHZZK_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Chzzk chat subscribe failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return unwrapChzzkContent(body);
}

export async function getChzzkUserSessions(
  config: ChzzkAuthConfig,
  accessToken: string
): Promise<ChzzkUserSession[]> {
  const url = new URL(`${config.openApiBaseUrl}/open/v1/sessions`);
  url.searchParams.set("size", "50");
  url.searchParams.set("page", "0");

  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(CHZZK_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Chzzk session list request failed with status ${response.status}`);
  }

  const parsed = sessionListResponseSchema.parse(unwrapChzzkContent(body));

  return parsed.data.map((session) => ({
    sessionKey: session.sessionKey,
    connectedDate: session.connectedDate,
    disconnectedDate: session.disconnectedDate ?? null,
    subscribedEvents: session.subscribedEvents.map((event) => ({
      eventType: event.eventType,
      channelId: event.channelId ?? null
    }))
  }));
}

function unwrapChzzkContent(body: unknown) {
  if (body && typeof body === "object" && "content" in body) {
    return (body as { content: unknown }).content;
  }

  return body;
}
