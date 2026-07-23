import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Link,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Unlink
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  confirmChessComVerification,
  createChessComVerification,
  disconnectChessComAccount,
  getChessComAccount,
  linkChessComAccount,
  refreshChessComAccount,
  type ChessComAccount,
  type ChessComVerificationChallenge
} from "../api/client";
import { getFirebaseClientAuth } from "../firebase/client";
import {
  ChessBadgePreferenceControl
} from "./ChessBadgePreferenceSettings";
import type { ChessBadgePreferenceController } from "./useChessBadgePreference";

type ViewState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "ready"; account: ChessComAccount | null }
  | { status: "error"; message: string; account: ChessComAccount | null };

const speedLabels: Record<ChessComAccount["ratings"][number]["speed"], string> = {
  bullet: "Bullet",
  blitz: "Blitz",
  rapid: "Rapid"
};

export function ChessComAccountSettings({
  badgePreference
}: {
  badgePreference: ChessBadgePreferenceController;
}) {
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verification, setVerification] = useState<ChessComVerificationChallenge | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    return onAuthStateChanged(getFirebaseClientAuth(), (user) => {
      if (!user) {
        setState({ status: "signed_out" });
        return;
      }

      void getChessComAccount()
        .then((account) => {
          setState({ status: "ready", account });
          if (account) {
            setUsername(account.username);
          }
        })
        .catch((error: unknown) => {
          setState({
            status: "error",
            message: errorMessage(error),
            account: null
          });
        });
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const account = await linkChessComAccount(username);
      setState({ status: "ready", account });
      setVerification(null);
      setUsername(account.username);
      void badgePreference.refresh();
    } catch (error) {
      setState({
        status: "error",
        message: errorMessage(error),
        account: state.status === "ready" || state.status === "error"
          ? state.account
          : null
      });
    } finally {
      setSubmitting(false);
    }
  };

  const createVerification = async () => {
    setVerifying(true);

    try {
      const challenge = await createChessComVerification();
      setVerification(challenge);
      setCopied(false);
      setState((current) =>
        current.status === "error"
          ? { status: "ready", account: current.account }
          : current
      );
    } catch (error) {
      setVerificationError(error);
    } finally {
      setVerifying(false);
    }
  };

  const confirmVerification = async () => {
    setVerifying(true);

    try {
      const verifiedAccount = await confirmChessComVerification();
      setState({ status: "ready", account: verifiedAccount });
      setVerification(null);
      void badgePreference.refresh();
    } catch (error) {
      setVerificationError(error);
    } finally {
      setVerifying(false);
    }
  };

  const copyCode = async () => {
    if (!verification) {
      return;
    }

    await navigator.clipboard.writeText(verification.code);
    setCopied(true);
  };

  const disconnectAccount = async () => {
    if (!window.confirm("Chess.com 계정 연동과 현재 채팅 배지를 해제할까요?")) {
      return;
    }

    setDisconnecting(true);

    try {
      await disconnectChessComAccount();
      setState({ status: "ready", account: null });
      setUsername("");
      setVerification(null);
      setCopied(false);
      void badgePreference.refresh();
    } catch (error) {
      setVerificationError(error);
    } finally {
      setDisconnecting(false);
    }
  };

  const refreshAccount = async () => {
    setRefreshing(true);

    try {
      const refreshedAccount = await refreshChessComAccount();
      setState({ status: "ready", account: refreshedAccount });
      setClock(
        refreshedAccount.ratingsFetchedAt
          ? Date.parse(refreshedAccount.ratingsFetchedAt)
          : clock
      );
      void badgePreference.refresh();
    } catch (error) {
      setVerificationError(error);
    } finally {
      setRefreshing(false);
    }
  };

  const setVerificationError = (error: unknown) => {
    setState((current) => ({
      status: "error",
      message: errorMessage(error),
      account: current.status === "ready" || current.status === "error"
        ? current.account
        : null
    }));
  };

  if (state.status === "loading") {
    return (
      <section className="py-8 text-slate-300">
        <LoaderCircle className="mr-2 inline animate-spin" size={18} />
        계정 정보를 확인하고 있습니다.
      </section>
    );
  }

  if (state.status === "signed_out") {
    return (
      <section className="border-y border-white/10 py-8">
        <h2 className="text-xl font-semibold text-white">Chess.com 계정</h2>
        <p className="mt-2 text-slate-300">
          먼저 치지직 시청자 계정으로 로그인해야 합니다.
        </p>
        <a
          href="/api/auth/chzzk/start?mode=viewer"
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-emerald-400"
        >
          <Link aria-hidden="true" size={18} />
          치지직으로 로그인
        </a>
      </section>
    );
  }

  const account = state.account;
  const refreshAvailableAt = account?.manualRefreshAvailableAt
    ? Date.parse(account.manualRefreshAvailableAt)
    : 0;
  const refreshCooldownMs = Math.max(0, refreshAvailableAt - clock);
  const refreshOnCooldown = refreshCooldownMs > 0;

  return (
    <section className="border-y border-white/10 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-white">Chess.com 계정</h2>
            <ChessBadgePreferenceControl
              provider="chesscom"
              preference={badgePreference}
            />
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Rapid, Blitz, Bullet 레이팅을 불러옵니다.
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
            {account.verified ? (
              <button
                type="button"
                disabled={refreshing || disconnecting || refreshOnCooldown}
                onClick={() => void refreshAccount()}
                title="Chess.com 레이팅 갱신"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-800 px-3 text-sm font-medium text-slate-100 ring-1 ring-white/10 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  className={refreshing ? "animate-spin" : undefined}
                  size={15}
                />
                {refreshing
                  ? "갱신 중"
                  : refreshOnCooldown
                    ? `${Math.ceil(refreshCooldownMs / 60_000)}분 후 갱신`
                    : "레이팅 갱신"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={disconnecting}
              onClick={() => void disconnectAccount()}
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
        <form
          className="mt-6 flex max-w-xl flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Chess.com 사용자명</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              maxLength={25}
              pattern="[A-Za-z0-9_-]+"
              autoComplete="off"
              placeholder="Chess.com 사용자명"
              className="h-10 w-full rounded-md border border-white/15 bg-slate-950 px-3 text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <LoaderCircle className="animate-spin" size={18} /> : <Link size={18} />}
            계정 조회
          </button>
        </form>
      ) : null}

      {state.status === "error" ? (
        <p className="mt-3 text-sm text-red-300">{state.message}</p>
      ) : null}

      {account ? (
        <div className="mt-6">
          {account.ratingsFetchedAt ? (
            <p className="mb-4 text-xs text-slate-400">
              마지막 갱신 {formatDateTime(account.ratingsFetchedAt)}
            </p>
          ) : null}
          {account.verified ? (
            <div className="flex items-center gap-3 border-l-2 border-emerald-400 pl-3 text-sm text-emerald-100">
              <CheckCircle2 className="shrink-0" size={18} />
              <p>Chess.com 계정 소유 인증이 완료되었습니다.</p>
            </div>
          ) : (
            <div className="border-l-2 border-amber-400 pl-3">
              <div className="flex items-start gap-3 text-sm text-amber-100">
                <ShieldAlert className="mt-0.5 shrink-0" size={18} />
                <p>
                  인증 전에는 이 레이팅이 채팅 오버레이에 표시되지 않습니다.
                </p>
              </div>

              {!verification ? (
                <button
                  type="button"
                  disabled={verifying}
                  onClick={() => void createVerification()}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-amber-300 px-4 font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {verifying ? <LoaderCircle className="animate-spin" size={18} /> : <ShieldAlert size={18} />}
                  인증 코드 생성
                </button>
              ) : (
                <div className="mt-4 max-w-xl">
                  <p className="text-sm text-slate-300">
                    Chess.com 프로필 설정의 위치(Location)에 아래 코드를 정확히 입력하고 저장하세요.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-slate-950 px-3 py-2 text-sm text-white ring-1 ring-white/15">
                      {verification.code}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyCode()}
                      title="인증 코드 복사"
                      aria-label="인증 코드 복사"
                      className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-800 text-slate-100 ring-1 ring-white/10 transition hover:bg-slate-700"
                    >
                      {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <a
                      href="https://www.chess.com/settings/profile"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-800 px-4 font-semibold text-slate-100 ring-1 ring-white/10 transition hover:bg-slate-700"
                    >
                      프로필 설정 열기
                      <ExternalLink size={16} />
                    </a>
                    <button
                      type="button"
                      disabled={verifying}
                      onClick={() => void confirmVerification()}
                      className="inline-flex h-10 items-center gap-2 rounded-md bg-amber-300 px-4 font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {verifying ? <LoaderCircle className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                      입력 완료, 인증 확인
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-slate-400">
                    코드는 48시간 동안 유효합니다. Chess.com 공개 API 캐시로 인해 변경 사항 반영이 늦을 수 있습니다.
                  </p>
                </div>
              )}
            </div>
          )}
          <dl className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-md bg-white/10 sm:grid-cols-3">
            {account.ratings.length > 0 ? account.ratings.map((rating) => (
              <div key={rating.speed} className="bg-slate-900 px-4 py-4">
                <dt className="text-sm text-slate-400">{speedLabels[rating.speed]}</dt>
                <dd className="mt-1 text-2xl font-semibold text-white">{rating.value}</dd>
                {account.verified && account.selectedSpeed === rating.speed ? (
                  <span className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-400 px-3 text-sm font-semibold text-slate-950">
                    <CheckCircle2 size={15} />
                    최고 레이팅 적용 중
                  </span>
                ) : null}
              </div>
            )) : (
              <div className="bg-slate-900 px-4 py-4 text-sm text-slate-400 sm:col-span-3">
                지원하는 시간 형식의 레이팅이 없습니다.
              </div>
            )}
          </dl>
        </div>
      ) : null}
    </section>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}


function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
