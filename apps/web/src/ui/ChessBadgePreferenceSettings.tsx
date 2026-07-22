import { useEffect, useState } from "react";
import type { ChessProvider } from "@elobadge/core";
import { LoaderCircle } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  getChessBadgePreference,
  updateChessBadgePreference,
  type ChessBadgePreference
} from "../api/client";
import { getFirebaseClientAuth } from "../firebase/client";

export function ChessBadgePreferenceControl({
  provider
}: {
  provider: ChessProvider;
}) {
  const [state, setState] = useState<ChessBadgePreference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = () => {
      void getChessBadgePreference()
        .then((preference) => {
          setState(preference);
          setError(null);
        })
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "배지 정보를 불러오지 못했습니다.");
        });
    };

    const unsubscribeAuth = onAuthStateChanged(
      getFirebaseClientAuth(),
      (user) => {
        if (user) {
          load();
        } else {
          setState(null);
          setError(null);
        }
      }
    );
    window.addEventListener("elobadge:chess-badges-changed", load);
    return () => {
      unsubscribeAuth();
      window.removeEventListener("elobadge:chess-badges-changed", load);
    };
  }, []);

  if (!state && !error) {
    return null;
  }
  const select = async (provider: ChessProvider) => {
    setSaving(true);
    setError(null);
    try {
      setState(await updateChessBadgePreference(provider));
      window.dispatchEvent(new Event("elobadge:chess-badges-changed"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "배지를 변경하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <span className="text-xs font-normal text-red-300" title={error}>
        배지 선택 오류
      </span>
    );
  }
  if (!state?.badges[provider]) {
    return null;
  }

  const selected = state.preferredProvider === provider;

  return (
    <label
      className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-2.5 text-xs font-medium ring-1 transition ${saving ? "cursor-wait opacity-60" : "cursor-pointer"} ${selected ? "bg-emerald-400/10 text-emerald-200 ring-emerald-400/40" : "bg-slate-900 text-slate-300 ring-white/15 hover:bg-slate-800 hover:text-white"}`}
    >
      <input
        type="radio"
        name="preferred-chess-rating-badge"
        value={provider}
        checked={selected}
        disabled={saving}
        onChange={() => void select(provider)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition ${selected ? "border-emerald-300 bg-emerald-300/10" : "border-slate-500 bg-slate-950"}`}
      >
        {selected ? <span className="size-2 rounded-full bg-emerald-300" /> : null}
      </span>
      <span>기본 배지</span>
      {saving ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />
      ) : null}
    </label>
  );
}
