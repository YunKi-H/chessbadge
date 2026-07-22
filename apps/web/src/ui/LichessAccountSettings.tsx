import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { ExternalLink, Link, LoaderCircle, RefreshCw, Unlink } from "lucide-react";
import {
  disconnectLichessAccount,
  getLichessAccount,
  refreshLichessAccount,
  startLichessConnection,
  type LichessAccount
} from "../api/client";
import { getFirebaseClientAuth } from "../firebase/client";

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

export function LichessAccountSettings() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [working, setWorking] = useState(false);
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
    setWorking(true);
    try {
      window.location.assign(await startLichessConnection());
    } catch (error) {
      setError(error);
      setWorking(false);
    }
  };

  const refresh = async () => {
    setWorking(true);
    try {
      const refreshed = await refreshLichessAccount();
      setState({ status: "ready", account: refreshed });
      if (refreshed.ratingsFetchedAt) {
        setClock(Date.parse(refreshed.ratingsFetchedAt));
      }
    } catch (error) {
      setError(error);
    } finally {
      setWorking(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Lichess 계정 연동과 현재 Lichess 배지를 해제할까요?")) {
      return;
    }
    setWorking(true);
    try {
      await disconnectLichessAccount();
      setState({ status: "ready", account: null });
    } catch (error) {
      setError(error);
    } finally {
      setWorking(false);
    }
  };

  const setError = (error: unknown) => setState((current) => ({
    status: "error",
    account: "account" in current ? current.account : null,
    message: errorMessage(error)
  }));

  if (state.status === "loading") {
    return <section className="py-8 text-slate-300"><LoaderCircle className="mr-2 inline animate-spin" size={18} />계정 정보를 확인하고 있습니다.</section>;
  }
  if (state.status === "signed_out") {
    return null;
  }

  const account = state.account;
  const availableAt = account?.manualRefreshAvailableAt
    ? Date.parse(account.manualRefreshAvailableAt)
    : 0;
  const cooldownMs = Math.max(0, availableAt - clock);

  return (
    <section className="border-b border-white/10 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Lichess 계정</h2>
          <p className="mt-1 text-sm text-slate-400">OAuth로 계정 소유를 확인하고 표준 체스 최고 레이팅을 표시합니다.</p>
        </div>
        {account ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <a href={account.profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-300 hover:text-emerald-200">
              {account.username}<ExternalLink aria-hidden="true" size={15} />
            </a>
            <button type="button" disabled={working || cooldownMs > 0} onClick={() => void refresh()} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-800 px-3 text-sm font-medium text-slate-100 ring-1 ring-white/10 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60">
              <RefreshCw className={working ? "animate-spin" : undefined} size={15} />
              {cooldownMs > 0 ? `${Math.ceil(cooldownMs / 60_000)}분 후 갱신` : "레이팅 갱신"}
            </button>
            <button type="button" disabled={working} onClick={() => void disconnect()} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-800 px-3 text-sm font-medium text-red-200 ring-1 ring-white/10 transition hover:bg-slate-700 disabled:opacity-60">
              <Unlink size={15} />연동 해제
            </button>
          </div>
        ) : null}
      </div>

      {!account ? (
        <button type="button" disabled={working} onClick={() => void connect()} className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-sky-500 px-4 font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60">
          {working ? <LoaderCircle className="animate-spin" size={18} /> : <Link size={18} />}
          Lichess로 연결
        </button>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {account.ratings.map((rating) => (
            <div key={rating.speed} className={`rounded-md border p-4 ${account.selectedSpeed === rating.speed ? "border-emerald-400/60 bg-emerald-400/10" : "border-white/10 bg-white/[0.03]"}`}>
              <p className="text-xs font-medium uppercase text-slate-400">{speedLabels[rating.speed]}</p>
              <p className="mt-1 text-xl font-semibold text-white">{rating.value}{rating.provisional ? "?" : ""}</p>
              <p className="mt-1 text-xs text-slate-500">{rating.games} games</p>
            </div>
          ))}
        </div>
      )}

      {"message" in state && state.message ? (
        <p className={`mt-4 text-sm ${state.status === "error" ? "text-red-300" : "text-emerald-300"}`}>{state.message}</p>
      ) : null}
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}
