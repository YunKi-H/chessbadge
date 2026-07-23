import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  CheckCircle2,
  ExternalLink,
  Link,
  LoaderCircle,
  RefreshCw,
  Unlink
} from "lucide-react";
import {
  disconnectLichessAccount,
  getLichessAccount,
  refreshLichessAccount,
  startLichessConnection,
  type LichessAccount
} from "../api/client";
import { getFirebaseClientAuth } from "../firebase/client";
import {
  ChessBadgePreferenceControl
} from "./ChessBadgePreferenceSettings";
import type { ChessBadgePreferenceController } from "./useChessBadgePreference";

type State =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "ready"; account: LichessAccount | null; message?: string }
  | { status: "error"; account: LichessAccount | null; message: string };

const speedLabels = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid",
  classical: "Classical"
} as const;

export function LichessAccountSettings({
  badgePreference
}: {
  badgePreference: ChessBadgePreferenceController;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => onAuthStateChanged(getFirebaseClientAuth(), (user) => {
    if (!user) {
      setState({ status: "signed_out" });
      return;
    }
    void getLichessAccount()
      .then((account) => {
        const result = new URLSearchParams(window.location.search).get("lichess");
        setState({
          status: "ready",
          account,
          message: result === "connected"
            ? "Lichess 계정이 연결되었습니다."
            : result === "expired"
              ? "Lichess 연결 요청이 만료되었습니다. 다시 시도해 주세요."
              : result === "error"
                ? "Lichess 계정을 연결하지 못했습니다. 다시 시도해 주세요."
                : undefined
        });
        if (result) {
          const url = new URL(window.location.href);
          url.searchParams.delete("lichess");
          window.history.replaceState({}, "", url);
        }
      })
      .catch((error: unknown) => setState({
        status: "error",
        account: null,
        message: errorMessage(error)
      }));
  }), []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      window.location.assign(await startLichessConnection());
    } catch (error) {
      setError(error);
      setConnecting(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const refreshed = await refreshLichessAccount();
      setState({ status: "ready", account: refreshed });
      void badgePreference.refresh();
      if (refreshed.ratingsFetchedAt) {
        setClock(Date.parse(refreshed.ratingsFetchedAt));
      }
    } catch (error) {
      setError(error);
    } finally {
      setRefreshing(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Lichess 계정 연동과 현재 Lichess 배지를 해제할까요?")) {
      return;
    }
    setDisconnecting(true);
    try {
      await disconnectLichessAccount();
      setState({ status: "ready", account: null });
      void badgePreference.refresh();
    } catch (error) {
      setError(error);
    } finally {
      setDisconnecting(false);
    }
  };

  const setError = (error: unknown) => setState((current) => ({
    status: "error",
    account: "account" in current ? current.account : null,
    message: errorMessage(error)
  }));

  if (state.status === "loading") {
    return (
      <section className="py-8 text-slate-300">
        <LoaderCircle className="mr-2 inline animate-spin" size={18} />
        계정 정보를 확인하고 있습니다.
      </section>
    );
  }
  if (state.status === "signed_out") {
    return null;
  }

  const account = state.account;
  const availableAt = account?.manualRefreshAvailableAt
    ? Date.parse(account.manualRefreshAvailableAt)
    : 0;
  const cooldownMs = Math.max(0, availableAt - clock);
  const ratingGridColumns =
    account?.ratings.length === 2
      ? "sm:grid-cols-2"
      : account?.ratings.length === 3
        ? "sm:grid-cols-3"
        : account && account.ratings.length >= 4
          ? "sm:grid-cols-2 lg:grid-cols-4"
          : "grid-cols-1";

  return (
    <section className="py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-white">Lichess 계정</h2>
            <ChessBadgePreferenceControl
              provider="lichess"
              preference={badgePreference}
            />
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Bullet, Blitz, Rapid, Classical 레이팅을 불러옵니다.
          </p>
        </div>
        {account ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <a
              href={account.profileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-300 hover:text-emerald-200"
            >
              {account.username}
              <ExternalLink aria-hidden="true" size={15} />
            </a>
            <button
              type="button"
              disabled={refreshing || disconnecting || cooldownMs > 0}
              onClick={() => void refresh()}
              title="Lichess 레이팅 갱신"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-800 px-3 text-sm font-medium text-slate-100 ring-1 ring-white/10 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={refreshing ? "animate-spin" : undefined}
                size={15}
              />
              {refreshing
                ? "갱신 중"
                : cooldownMs > 0
                  ? `${Math.ceil(cooldownMs / 60_000)}분 후 갱신`
                  : "레이팅 갱신"}
            </button>
            <button
              type="button"
              disabled={refreshing || disconnecting}
              onClick={() => void disconnect()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-800 px-3 text-sm font-medium text-red-200 ring-1 ring-white/10 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {disconnecting ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : (
                <Unlink size={15} />
              )}
              연동 해제
            </button>
          </div>
        ) : null}
      </div>

      {!account ? (
        <button
          type="button"
          disabled={connecting}
          onClick={() => void connect()}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-emerald-500 px-4 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {connecting ? (
            <LoaderCircle className="animate-spin" size={18} />
          ) : (
            <Link size={18} />
          )}
          Lichess로 연결
        </button>
      ) : null}

      {"message" in state && state.message ? (
        <p className={`mt-4 text-sm ${state.status === "error" ? "text-red-300" : "text-emerald-300"}`}>{state.message}</p>
      ) : null}

      {account ? (
        <div className="mt-6">
          {account.ratingsFetchedAt ? (
            <p className="mb-4 text-xs text-slate-400">
              마지막 갱신 {formatDateTime(account.ratingsFetchedAt)}
            </p>
          ) : null}
          <div className="flex items-center gap-3 border-l-2 border-emerald-400 pl-3 text-sm text-emerald-100">
            <CheckCircle2 className="shrink-0" size={18} />
            <p>Lichess 계정 소유 인증이 완료되었습니다.</p>
          </div>
          <dl className={`mt-5 grid gap-px overflow-hidden rounded-md bg-white/10 ${ratingGridColumns}`}>
            {account.ratings.length > 0 ? account.ratings.map((rating) => (
              <div key={rating.speed} className="bg-slate-900 px-4 py-4">
                <dt className="text-sm text-slate-400">
                  {speedLabels[rating.speed]}
                </dt>
                <dd className="mt-1 text-2xl font-semibold text-white">
                  {rating.value}{rating.provisional ? "?" : ""}
                </dd>
                <p className="mt-1 text-xs text-slate-500">
                  {rating.games} games
                </p>
                {account.selectedSpeed === rating.speed ? (
                  <span className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-400 px-3 text-sm font-semibold text-slate-950">
                    <CheckCircle2 size={15} />
                    최고 레이팅 적용 중
                  </span>
                ) : null}
              </div>
            )) : (
              <div className="bg-slate-900 px-4 py-4 text-sm text-slate-400 sm:col-span-2 lg:col-span-4">
                지원하는 시간 형식의 레이팅이 없습니다.
              </div>
            )}
          </dl>
        </div>
      ) : null}
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}


function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
