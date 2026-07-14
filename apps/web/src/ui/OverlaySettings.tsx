import { useEffect, useState } from "react";
import { Copy, Link, Power, RefreshCw } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  disableOverlayAccess,
  enableOverlayAccess,
  getOverlayAccess,
  rotateOverlayAccess,
  type OverlayAccess
} from "../api/client";
import { getFirebaseClientAuth } from "../firebase/client";

type SettingsState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "ready"; overlay: OverlayAccess | null }
  | { status: "error"; message: string };

export function OverlaySettings() {
  const [state, setState] = useState<SettingsState>({ status: "loading" });
  const [updating, setUpdating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(getFirebaseClientAuth(), (user) => {
      if (!user) {
        setState({ status: "signed_out" });
        return;
      }

      void getOverlayAccess()
        .then((overlay) => setState({ status: "ready", overlay }))
        .catch((error: unknown) => setState(toErrorState(error)));
    });
  }, []);

  const runUpdate = async (operation: () => Promise<OverlayAccess | null>) => {
    setUpdating(true);
    setCopied(false);

    try {
      const overlay = await operation();
      setState({ status: "ready", overlay });
    } catch (error) {
      setState(toErrorState(error));
    } finally {
      setUpdating(false);
    }
  };

  const overlay = state.status === "ready" ? state.overlay : null;

  return (
    <section className="mb-10 max-w-2xl border-y border-white/10 py-6">
      <div className="mb-4 flex items-center gap-2">
        <Link aria-hidden="true" className="text-emerald-300" size={20} />
        <h2 className="text-lg font-semibold text-white">OBS 오버레이</h2>
      </div>

      {state.status === "loading" ? (
        <p className="text-sm text-slate-400">불러오는 중</p>
      ) : null}

      {state.status === "signed_out" ? (
        <a
          href="/api/auth/chzzk/start?mode=streamer"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-500 px-4 font-semibold text-slate-950 transition hover:bg-emerald-400"
        >
          <Power aria-hidden="true" size={18} />
          치지직 스트리머 연결
        </a>
      ) : null}

      {state.status === "error" ? (
        <p className="text-sm text-red-300">{state.message}</p>
      ) : null}

      {state.status === "ready" && !overlay ? (
        <button
          type="button"
          disabled={updating}
          onClick={() => void runUpdate(enableOverlayAccess)}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50"
        >
          <Power aria-hidden="true" size={18} />
          URL 생성
        </button>
      ) : null}

      {overlay ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              aria-label="OBS Browser Source URL"
              readOnly
              value={overlay.url}
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none"
            />
            <button
              type="button"
              title="URL 복사"
              aria-label="URL 복사"
              onClick={() => {
                void navigator.clipboard.writeText(overlay.url).then(() => setCopied(true));
              }}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-800 text-white hover:bg-slate-700"
            >
              <Copy aria-hidden="true" size={18} />
            </button>
          </div>
          {copied ? <p className="text-sm text-emerald-300">복사됨</p> : null}

          <div className="flex flex-wrap gap-2">
            {!overlay.active ? (
              <button
                type="button"
                disabled={updating}
                onClick={() => void runUpdate(enableOverlayAccess)}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-3 py-2 font-semibold text-slate-950 disabled:opacity-50"
              >
                <Power aria-hidden="true" size={17} />
                활성화
              </button>
            ) : null}
            <button
              type="button"
              disabled={updating}
              onClick={() => {
                if (window.confirm("기존 오버레이 URL을 폐기하고 새로 발급할까요?")) {
                  void runUpdate(rotateOverlayAccess);
                }
              }}
              className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw aria-hidden="true" size={17} />
              재발급
            </button>
            {overlay.active ? (
              <button
                type="button"
                disabled={updating}
                onClick={() => void runUpdate(disableOverlayAccess)}
                className="inline-flex items-center gap-2 rounded-md bg-red-950 px-3 py-2 font-semibold text-red-200 disabled:opacity-50"
              >
                <Power aria-hidden="true" size={17} />
                비활성화
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function toErrorState(error: unknown): SettingsState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : "요청에 실패했습니다."
  };
}
