import { useEffect, useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { getFirebaseClientAuth } from "../firebase/client";
import { getCurrentApiUser } from "../api/client";
import type { ChzzkLoginMode } from "@elobadge/core";
import { Link, useNavigate } from "react-router-dom";

type LoginState =
  | { status: "loading" }
  | { status: "success"; displayName: string; mode: ChzzkLoginMode }
  | { status: "error"; message: string };

interface LoginExchangeResponse {
  ok: true;
  customToken: string;
  mode: ChzzkLoginMode;
  user: {
    displayName: string;
  };
}

const pendingLogins = new Map<string, Promise<LoginExchangeResponse>>();

export function ChzzkAuthCallback() {
  const navigate = useNavigate();
  const [code] = useState(() =>
    new URLSearchParams(window.location.search).get("code")
  );
  const [state, setState] = useState<LoginState>(() =>
    code
      ? { status: "loading" }
      : { status: "error", message: "로그인 코드가 없습니다." }
  );

  useEffect(() => {
    if (!code) {
      return;
    }

    void completeLogin(code)
      .then((result) => {
        setState({
          status: "success",
          displayName: result.user.displayName,
          mode: result.mode
        });
        void navigate("/auth/chzzk/callback", { replace: true });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "로그인에 실패했습니다.";
        setState({ status: "error", message });
      });
  }, [code, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="w-full max-w-md rounded-md bg-slate-900 p-6 ring-1 ring-white/10">
        {state.status === "loading" ? (
          <p className="text-slate-200">치지직 계정을 연결하고 있습니다.</p>
        ) : null}
        {state.status === "success" ? (
          <>
            <h1 className="text-xl font-semibold text-white">계정 연결 완료</h1>
            <p className="mt-2 text-slate-300">
              {state.displayName} 계정을 {loginModeLabel(state.mode)} 모드로 연결했습니다.
            </p>
            <Link
              to={`/${state.mode}`}
              className="mt-5 inline-flex rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              계속하기
            </Link>
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
    (response.mode === "streamer" || response.mode === "viewer") &&
    Boolean(response.user) &&
    typeof response.user?.displayName === "string"
  );
}

function loginModeLabel(mode: ChzzkLoginMode) {
  return mode === "streamer" ? "스트리머" : "시청자";
}
