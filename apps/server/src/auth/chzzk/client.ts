import { z } from "zod";

const tokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.string(),
  expiresIn: z.union([z.string(), z.number()]),
  scope: z.string().optional()
});

const sessionResponseSchema = z.object({
  url: z.string().url()
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
  const response = await fetch(`${config.openApiBaseUrl}/auth/v1/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      grantType: "authorization_code",
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
      state
    })
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Chzzk token request failed: ${response.status} ${JSON.stringify(body)}`);
  }

  const content = unwrapChzzkContent(body);
  const parsed = tokenResponseSchema.parse(content);

  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken,
    tokenType: parsed.tokenType,
    expiresIn: Number(parsed.expiresIn),
    scope: parsed.scope ?? null
  };
}

export async function createChzzkUserSession(
  config: ChzzkAuthConfig,
  accessToken: string
): Promise<ChzzkSessionResponse> {
  const response = await fetch(`${config.openApiBaseUrl}/open/v1/sessions/auth`, {
    method: "GET",
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

export async function subscribeChzzkChatEvent(
  config: ChzzkAuthConfig,
  accessToken: string,
  sessionKey: string
) {
  const url = new URL(`${config.openApiBaseUrl}/open/v1/sessions/events/subscribe/chat`);
  url.searchParams.set("sessionKey", sessionKey);

  const response = await fetch(url, {
    method: "POST",
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

function unwrapChzzkContent(body: unknown) {
  if (body && typeof body === "object" && "content" in body) {
    return (body as { content: unknown }).content;
  }

  return body;
}
