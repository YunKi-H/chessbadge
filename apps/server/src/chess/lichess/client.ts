import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const perfSchema = z.object({
  games: z.number().int().nonnegative(),
  rating: z.number().int(),
  rd: z.number().nonnegative(),
  prov: z.boolean().optional()
});

const userSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  url: z.string().url().optional(),
  disabled: z.boolean().optional(),
  perfs: z.object({
    bullet: perfSchema.optional(),
    blitz: perfSchema.optional(),
    rapid: perfSchema.optional(),
    classical: perfSchema.optional()
  }).optional()
});

const tokenSchema = z.object({
  token_type: z.string().min(1),
  access_token: z.string().min(1),
  expires_in: z.number().int().positive()
});

export type LichessSpeed = "bullet" | "blitz" | "rapid" | "classical";

export interface LichessRating {
  speed: LichessSpeed;
  value: number;
  ratingDeviation: number;
  provisional: boolean;
  games: number;
}

export interface LichessPlayer {
  username: string;
  normalizedUsername: string;
  playerId: string;
  profileUrl: string;
  avatarUrl: null;
  status: "active" | "disabled";
  ratings: LichessRating[];
}

export interface LichessAuthConfig {
  clientId: string;
  redirectUri: string;
  baseUrl: string;
}

export interface LichessAccessToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

export type LichessClientErrorCode =
  | "invalid_response"
  | "not_found"
  | "rate_limited"
  | "oauth_failed"
  | "request_failed";

export class LichessClientError extends Error {
  constructor(
    public readonly code: LichessClientErrorCode,
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "LichessClientError";
  }
}

export function createLichessPkceVerifier(): string {
  return randomBytes(64).toString("base64url");
}

export function createLichessCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function createLichessAuthorizationUrl(
  config: LichessAuthConfig,
  state: string,
  codeChallenge: string
): URL {
  const url = new URL("/oauth", config.baseUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("state", state);
  return url;
}

export function createLichessClient(
  config: LichessAuthConfig,
  request: typeof fetch = fetch
) {
  let requestQueue = Promise.resolve();

  const serialRequest = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = requestQueue.then(operation, operation);
    requestQueue = result.then(() => undefined, () => undefined);
    return result;
  };

  const requestJson = async (
    path: string,
    init: RequestInit,
    oauthRequest = false
  ): Promise<unknown> => serialRequest(async () => {
    let response: Response;

    try {
      response = await request(new URL(path, config.baseUrl), {
        ...init,
        headers: { Accept: "application/json", ...init.headers },
        signal: AbortSignal.timeout(10_000)
      });
    } catch (error) {
      throw new LichessClientError(
        "request_failed",
        error instanceof Error ? error.message : "Lichess request failed"
      );
    }

    if (response.status === 404) {
      throw new LichessClientError("not_found", "Lichess account not found", 404);
    }
    if (response.status === 429) {
      throw new LichessClientError("rate_limited", "Lichess rate limited", 429);
    }
    if (!response.ok) {
      throw new LichessClientError(
        oauthRequest ? "oauth_failed" : "request_failed",
        `Lichess request failed with status ${response.status}`,
        response.status
      );
    }

    return response.json() as Promise<unknown>;
  });

  const parsePlayer = (value: unknown): LichessPlayer => {
    const result = userSchema.safeParse(value);

    if (!result.success) {
      throw new LichessClientError(
        "invalid_response",
        "Lichess returned an invalid user profile"
      );
    }

    const ratings: LichessRating[] = [];
    const entries = [
      ["bullet", result.data.perfs?.bullet],
      ["blitz", result.data.perfs?.blitz],
      ["rapid", result.data.perfs?.rapid],
      ["classical", result.data.perfs?.classical]
    ] as const;

    for (const [speed, perf] of entries) {
      if (perf && perf.games > 0) {
        ratings.push({
          speed,
          value: perf.rating,
          ratingDeviation: perf.rd,
          provisional: perf.prov === true,
          games: perf.games
        });
      }
    }

    return {
      username: result.data.username,
      normalizedUsername: result.data.id.toLowerCase(),
      playerId: result.data.id,
      profileUrl: result.data.url ?? `https://lichess.org/@/${result.data.id}`,
      avatarUrl: null,
      status: result.data.disabled ? "disabled" : "active",
      ratings
    };
  };

  return {
    async exchangeCode(code: string, codeVerifier: string): Promise<LichessAccessToken> {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        redirect_uri: config.redirectUri,
        client_id: config.clientId
      });
      const result = tokenSchema.safeParse(await requestJson("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
      }, true));

      if (!result.success) {
        throw new LichessClientError("invalid_response", "Invalid Lichess token response");
      }

      return {
        accessToken: result.data.access_token,
        tokenType: result.data.token_type,
        expiresIn: result.data.expires_in
      };
    },

    async getCurrentPlayer(accessToken: string): Promise<LichessPlayer> {
      return parsePlayer(await requestJson("/api/account", {
        headers: { Authorization: `Bearer ${accessToken}` }
      }));
    },

    async getPlayer(username: string): Promise<LichessPlayer> {
      return parsePlayer(await requestJson(
        `/api/user/${encodeURIComponent(username)}`,
        { headers: {} }
      ));
    },

    async revokeToken(accessToken: string): Promise<void> {
      await serialRequest(async () => {
        const response = await request(new URL("/api/token", config.baseUrl), {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(10_000)
        });

        if (!response.ok && response.status !== 401) {
          throw new LichessClientError(
            "oauth_failed",
            `Lichess token revocation failed with status ${response.status}`,
            response.status
          );
        }
      });
    }
  };
}

export type LichessClient = ReturnType<typeof createLichessClient>;

export function getLichessAuthConfig(): LichessAuthConfig {
  return {
    clientId: requiredEnv("LICHESS_CLIENT_ID"),
    redirectUri: requiredEnv("LICHESS_REDIRECT_URI"),
    baseUrl: process.env.LICHESS_BASE_URL?.trim() || "https://lichess.org"
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}
