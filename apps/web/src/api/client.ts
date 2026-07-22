import {
  isOverlayFontFamily,
  type OverlayAppearance
} from "@elobadge/core";
import { getFirebaseClientAuth } from "../firebase/client";

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const user = getFirebaseClientAuth().currentUser;

  if (!user) {
    throw new Error("Firebase 로그인이 필요합니다.");
  }

  const idToken = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${idToken}`);

  return fetch(input, {
    ...init,
    headers
  });
}

export interface CurrentApiUser {
  uid: string;
  provider: string | null;
  chzzkChannelId: string | null;
  email: string | null;
}

export interface OverlayAccess {
  publicToken: string;
  active: boolean;
  url: string;
  appearance: OverlayAppearance;
}

export interface ChessComAccount {
  provider: "chesscom";
  username: string;
  profileUrl: string;
  avatarUrl: string | null;
  verified: boolean;
  selectedSpeed: "bullet" | "blitz" | "rapid" | null;
  ratingsFetchedAt: string | null;
  manualRefreshAvailableAt: string | null;
  ratings: Array<{
    speed: "bullet" | "blitz" | "rapid";
    value: number;
    ratingDeviation: number;
    providerUpdatedAt: string;
  }>;
}

export interface ChessComVerificationChallenge {
  code: string;
  expiresAt: string;
}

export interface LichessAccount {
  provider: "lichess";
  username: string;
  profileUrl: string;
  verified: true;
  selectedSpeed: "bullet" | "blitz" | "rapid" | "classical" | null;
  ratingsFetchedAt: string | null;
  manualRefreshAvailableAt: string | null;
  ratings: Array<{
    speed: "bullet" | "blitz" | "rapid" | "classical";
    value: number;
    ratingDeviation: number;
    provisional: boolean;
    games: number;
  }>;
}

export async function getLichessAccount(): Promise<LichessAccount | null> {
  const response = await authenticatedFetch("/api/chess/lichess/account");
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isLichessAccountResponse(body)) {
    throw new Error(apiError(body, "Lichess 계정 정보를 불러오지 못했습니다."));
  }
  return body.account;
}

export async function startLichessConnection(): Promise<string> {
  const response = await authenticatedFetch("/api/auth/lichess/start", {
    method: "POST"
  });
  const body: unknown = await response.json().catch(() => null);
  if (
    !response.ok ||
    !body ||
    typeof body !== "object" ||
    (body as { ok?: unknown }).ok !== true ||
    typeof (body as { authorizationUrl?: unknown }).authorizationUrl !== "string"
  ) {
    throw new Error(apiError(body, "Lichess 연결을 시작하지 못했습니다."));
  }
  return (body as { authorizationUrl: string }).authorizationUrl;
}

export async function refreshLichessAccount(): Promise<LichessAccount> {
  const response = await authenticatedFetch("/api/chess/lichess/account/refresh", {
    method: "POST"
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isLichessAccountResponse(body) || !body.account) {
    throw new Error(apiError(body, "Lichess 레이팅을 갱신하지 못했습니다."));
  }
  return body.account;
}

export async function disconnectLichessAccount(): Promise<void> {
  const response = await authenticatedFetch("/api/chess/lichess/account", {
    method: "DELETE"
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !isLichessAccountResponse(body) || body.account !== null) {
    throw new Error(apiError(body, "Lichess 계정 연동을 해제하지 못했습니다."));
  }
}

export async function disconnectChzzkConnection(): Promise<boolean> {
  const response = await authenticatedFetch("/api/chzzk/connection", {
    method: "DELETE"
  });
  const body: unknown = await response.json().catch(() => null);

  if (
    !response.ok ||
    !body ||
    typeof body !== "object" ||
    (body as { ok?: unknown }).ok !== true ||
    typeof (body as { revoked?: unknown }).revoked !== "boolean"
  ) {
    throw new Error(apiError(body, "치지직 연결을 해제하지 못했습니다."));
  }

  return (body as { revoked: boolean }).revoked;
}

export async function deleteEloBadgeAccount(): Promise<void> {
  const response = await authenticatedFetch("/api/account", {
    method: "DELETE"
  });
  const body: unknown = await response.json().catch(() => null);

  if (
    !response.ok ||
    !body ||
    typeof body !== "object" ||
    (body as { ok?: unknown }).ok !== true
  ) {
    throw new Error(apiError(body, "EloBadge 계정을 삭제하지 못했습니다."));
  }
}

export async function getChessComAccount(): Promise<ChessComAccount | null> {
  const response = await authenticatedFetch("/api/chess/chesscom/account");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !isChessComAccountResponse(body)) {
    throw new Error(apiError(body, "Chess.com 계정 정보를 불러오지 못했습니다."));
  }

  return body.account;
}

export async function linkChessComAccount(username: string): Promise<ChessComAccount> {
  const response = await authenticatedFetch("/api/chess/chesscom/account", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username })
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !isChessComAccountResponse(body) || !body.account) {
    throw new Error(apiError(body, "Chess.com 계정을 연결하지 못했습니다."));
  }

  return body.account;
}

export async function disconnectChessComAccount(): Promise<void> {
  const response = await authenticatedFetch("/api/chess/chesscom/account", {
    method: "DELETE"
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !isChessComAccountResponse(body) || body.account !== null) {
    throw new Error(apiError(body, "Chess.com 계정 연동을 해제하지 못했습니다."));
  }
}

export async function refreshChessComAccount(): Promise<ChessComAccount> {
  const response = await authenticatedFetch(
    "/api/chess/chesscom/account/refresh",
    { method: "POST" }
  );
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !isChessComAccountResponse(body) || !body.account) {
    throw new Error(apiError(body, "Chess.com 레이팅을 갱신하지 못했습니다."));
  }

  return body.account;
}

export async function createChessComVerification(): Promise<ChessComVerificationChallenge> {
  const response = await authenticatedFetch("/api/chess/chesscom/verification", {
    method: "POST"
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !isChessComVerificationResponse(body)) {
    throw new Error(apiError(body, "Chess.com 인증 코드를 생성하지 못했습니다."));
  }

  return body.verification;
}

export async function confirmChessComVerification(): Promise<ChessComAccount> {
  const response = await authenticatedFetch(
    "/api/chess/chesscom/verification/confirm",
    { method: "POST" }
  );
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !isChessComAccountResponse(body) || !body.account) {
    throw new Error(apiError(body, "Chess.com 계정 인증에 실패했습니다."));
  }

  return body.account;
}

export async function getCurrentApiUser(): Promise<CurrentApiUser> {
  const response = await authenticatedFetch("/api/me");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !isCurrentUserResponse(body)) {
    throw new Error("서버 로그인 확인에 실패했습니다.");
  }

  return body.user;
}

export async function getOverlayAccess(): Promise<OverlayAccess | null> {
  const response = await authenticatedFetch("/api/overlay");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !isOverlayResponse(body)) {
    throw new Error("오버레이 정보를 불러오지 못했습니다.");
  }

  return body.overlay;
}

export async function enableOverlayAccess(): Promise<OverlayAccess> {
  return updateOverlayAccess("/api/overlay");
}

export async function rotateOverlayAccess(): Promise<OverlayAccess> {
  return updateOverlayAccess("/api/overlay/rotate");
}

export async function disableOverlayAccess(): Promise<OverlayAccess | null> {
  const response = await authenticatedFetch("/api/overlay/disable", {
    method: "POST"
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !isOverlayResponse(body)) {
    throw new Error(apiError(body, "오버레이를 비활성화하지 못했습니다."));
  }

  return body.overlay;
}

export async function updateOverlayAppearance(
  appearance: OverlayAppearance
): Promise<OverlayAccess> {
  const response = await authenticatedFetch("/api/overlay/appearance", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(appearance)
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !isOverlayResponse(body) || !body.overlay) {
    throw new Error(apiError(body, "오버레이 화면 설정을 저장하지 못했습니다."));
  }

  return body.overlay;
}

async function updateOverlayAccess(path: string): Promise<OverlayAccess> {
  const response = await authenticatedFetch(path, { method: "POST" });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !isOverlayResponse(body) || !body.overlay) {
    throw new Error(apiError(body, "오버레이 설정을 변경하지 못했습니다."));
  }

  return body.overlay;
}

function isCurrentUserResponse(
  value: unknown
): value is { ok: true; user: CurrentApiUser } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as {
    ok?: unknown;
    user?: Partial<CurrentApiUser>;
  };

  return (
    response.ok === true &&
    Boolean(response.user) &&
    typeof response.user?.uid === "string"
  );
}

function isOverlayResponse(
  value: unknown
): value is { ok: true; overlay: OverlayAccess | null } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as {
    ok?: unknown;
    overlay?: Partial<OverlayAccess> | null;
  };

  if (response.ok !== true || response.overlay === undefined) {
    return false;
  }

  if (response.overlay === null) {
    return true;
  }

  return (
    typeof response.overlay.publicToken === "string" &&
    typeof response.overlay.active === "boolean" &&
    typeof response.overlay.url === "string" &&
    isOverlayAppearance(response.overlay.appearance)
  );
}

function isOverlayAppearance(value: unknown): value is OverlayAppearance {
  if (!value || typeof value !== "object") {
    return false;
  }

  const appearance = value as Partial<OverlayAppearance>;

  return (
    typeof appearance.messageMaxWidthPx === "number" &&
    Number.isInteger(appearance.messageMaxWidthPx) &&
    appearance.messageMaxWidthPx >= 300 &&
    appearance.messageMaxWidthPx <= 600 &&
    typeof appearance.backgroundVisible === "boolean" &&
    typeof appearance.backgroundColor === "string" &&
    /^#[0-9A-Fa-f]{6}$/.test(appearance.backgroundColor) &&
    typeof appearance.backgroundOpacity === "number" &&
    Number.isInteger(appearance.backgroundOpacity) &&
    appearance.backgroundOpacity >= 0 &&
    appearance.backgroundOpacity <= 100 &&
    typeof appearance.chzzkBadgesVisible === "boolean" &&
    isChzzkBadgeVisibility(appearance.chzzkBadgeVisibility) &&
    typeof appearance.nicknameVisible === "boolean" &&
    (appearance.nicknameColorMode === "fixed" ||
      appearance.nicknameColorMode === "by_user" ||
      appearance.nicknameColorMode === "by_role") &&
    typeof appearance.nicknameColor === "string" &&
    /^#[0-9A-Fa-f]{6}$/.test(appearance.nicknameColor) &&
    isChatAuthorColors(appearance.nicknameRoleColors) &&
    (appearance.messageColorMode === "fixed" ||
      appearance.messageColorMode === "by_role") &&
    typeof appearance.messageColor === "string" &&
    /^#[0-9A-Fa-f]{6}$/.test(appearance.messageColor) &&
    isChatAuthorColors(appearance.messageRoleColors) &&
    isOverlayFontFamily(appearance.fontFamily) &&
    typeof appearance.fontSizePx === "number" &&
    Number.isInteger(appearance.fontSizePx) &&
    appearance.fontSizePx >= 12 &&
    appearance.fontSizePx <= 36 &&
    (appearance.fontWeight === 400 ||
      appearance.fontWeight === 500 ||
      appearance.fontWeight === 600 ||
      appearance.fontWeight === 700 ||
      appearance.fontWeight === 900) &&
    (appearance.fontLineHeight === 1.2 ||
      appearance.fontLineHeight === 1.4 ||
      appearance.fontLineHeight === 1.6) &&
    (appearance.messageDurationSeconds === 0 ||
      appearance.messageDurationSeconds === 10 ||
      appearance.messageDurationSeconds === 20 ||
      appearance.messageDurationSeconds === 30 ||
      appearance.messageDurationSeconds === 60)
  );
}

function isChzzkBadgeVisibility(
  value: unknown
): value is OverlayAppearance["chzzkBadgeVisibility"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const visibility = value as Partial<
    OverlayAppearance["chzzkBadgeVisibility"]
  >;

  return [
    visibility.role,
    visibility.subscription,
    visibility.donation,
    visibility.subscription_gift,
    visibility.unknown
  ].every((visible) => typeof visible === "boolean");
}

function isChatAuthorColors(
  value: unknown
): value is OverlayAppearance["nicknameRoleColors"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const colors = value as Partial<OverlayAppearance["nicknameRoleColors"]>;
  return [
    colors.streamer,
    colors.manager,
    colors.donator,
    colors.subscriber,
    colors.viewer
  ].every(
    (color) => typeof color === "string" && /^#[0-9A-Fa-f]{6}$/.test(color)
  );
}

function isChessComAccountResponse(
  value: unknown
): value is { ok: true; account: ChessComAccount | null } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as {
    ok?: unknown;
    account?: Partial<ChessComAccount> | null;
  };

  if (response.ok !== true || response.account === undefined) {
    return false;
  }

  if (response.account === null) {
    return true;
  }

  return (
    response.account.provider === "chesscom" &&
    typeof response.account.username === "string" &&
    typeof response.account.profileUrl === "string" &&
    typeof response.account.verified === "boolean" &&
    (response.account.ratingsFetchedAt === null ||
      typeof response.account.ratingsFetchedAt === "string") &&
    (response.account.manualRefreshAvailableAt === null ||
      typeof response.account.manualRefreshAvailableAt === "string") &&
    (response.account.selectedSpeed === null ||
      response.account.selectedSpeed === "bullet" ||
      response.account.selectedSpeed === "blitz" ||
      response.account.selectedSpeed === "rapid") &&
    Array.isArray(response.account.ratings)
  );
}

function isChessComVerificationResponse(
  value: unknown
): value is { ok: true; verification: ChessComVerificationChallenge } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as {
    ok?: unknown;
    verification?: Partial<ChessComVerificationChallenge>;
  };

  return (
    response.ok === true &&
    typeof response.verification?.code === "string" &&
    typeof response.verification.expiresAt === "string"
  );
}

function isLichessAccountResponse(
  value: unknown
): value is { ok: true; account: LichessAccount | null } {
  if (!value || typeof value !== "object") {
    return false;
  }
  const response = value as {
    ok?: unknown;
    account?: Partial<LichessAccount> | null;
  };
  if (response.ok !== true || response.account === undefined) {
    return false;
  }
  if (response.account === null) {
    return true;
  }
  return (
    response.account.provider === "lichess" &&
    typeof response.account.username === "string" &&
    typeof response.account.profileUrl === "string" &&
    response.account.verified === true &&
    (response.account.ratingsFetchedAt === null ||
      typeof response.account.ratingsFetchedAt === "string") &&
    (response.account.manualRefreshAvailableAt === null ||
      typeof response.account.manualRefreshAvailableAt === "string") &&
    (response.account.selectedSpeed === null ||
      response.account.selectedSpeed === "bullet" ||
      response.account.selectedSpeed === "blitz" ||
      response.account.selectedSpeed === "rapid" ||
      response.account.selectedSpeed === "classical") &&
    Array.isArray(response.account.ratings)
  );
}

function apiError(value: unknown, fallback: string): string {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }

  return fallback;
}
