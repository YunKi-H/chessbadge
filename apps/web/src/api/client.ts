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
    throw new Error("오버레이를 비활성화하지 못했습니다.");
  }

  return body.overlay;
}

async function updateOverlayAccess(path: string): Promise<OverlayAccess> {
  const response = await authenticatedFetch(path, { method: "POST" });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !isOverlayResponse(body) || !body.overlay) {
    throw new Error("오버레이 설정을 변경하지 못했습니다.");
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
    typeof response.overlay.url === "string"
  );
}
