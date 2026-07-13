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

export async function getCurrentApiUser(): Promise<CurrentApiUser> {
  const response = await authenticatedFetch("/api/me");
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !isCurrentUserResponse(body)) {
    throw new Error("서버 로그인 확인에 실패했습니다.");
  }

  return body.user;
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
