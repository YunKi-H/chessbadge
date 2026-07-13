import { useEffect, useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { getFirebaseClientAuth } from "../firebase/client";
import { getCurrentApiUser } from "../api/client";

type LoginState =
  | { status: "loading" }
  | { status: "success"; displayName: string }
  | { status: "error"; message: string };

interface LoginExchangeResponse {
  ok: true;
  customToken: string;
  user: {
    displayName: string;
  };
}

const pendingLogins = new Map<string, Promise<LoginExchangeResponse>>();

export function ChzzkAuthCallback() {
  const [state, setState] = useState<LoginState>({ status: "loading" });

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");

    if (!code) {
      setState({ status: "error", message: "로그인 코드가 없습니다." });
      return;
    }

    void completeLogin(code)
      .then((result) => {
        window.history.replaceState({}, "", "/streamer");
        setState({ status: "success", displayName: result.user.displayName });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "로그인에 실패했습니다.";
        setState({ status: "error", message });
      });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="w-full max-w-md rounded-md bg-slate-900 p-6 ring-1 ring-white/10">
        {state.status === "loading" ? (
          <p className="text-slate-200">치지직 계정을 연결하고 있습니다.</p>
        ) : null}
        {state.status === "success" ? (
          <>
            <h1 className="text-xl font-semibold text-white">계정 연결 완료</h1>
            <p className="mt-2 text-slate-300">{state.displayName} 계정으로 로그인했습니다.</p>
          </>
        ) : null}
        {state.status === "error" ? (
          <>
            <h1 className="text-xl font-semibold text-white">계정 연결 실패</h1>
            <p className="mt-2 text-red-300">{state.message}</p>
          </>
        ) : null}
      </section>
    </main>
  );
}

function completeLogin(code: string): Promise<LoginExchangeResponse> {
  const pendingLogin = pendingLogins.get(code);

  if (pendingLogin) {
    return pendingLogin;
  }

  const login = exchangeLoginCode(code).then(async (result) => {
    await signInWithCustomToken(getFirebaseClientAuth(), result.customToken);
    await getCurrentApiUser();
    return result;
  });

  pendingLogins.set(code, login);
  return login;
}

async function exchangeLoginCode(code: string): Promise<LoginExchangeResponse> {
  const response = await fetch("/api/auth/firebase/exchange", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ code })
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !isLoginExchangeResponse(body)) {
    throw new Error("로그인 코드가 만료되었거나 유효하지 않습니다.");
  }

  return body;
}

function isLoginExchangeResponse(value: unknown): value is LoginExchangeResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const response = value as Partial<LoginExchangeResponse>;
  return (
    response.ok === true &&
    typeof response.customToken === "string" &&
    Boolean(response.user) &&
    typeof response.user?.displayName === "string"
  );
}
