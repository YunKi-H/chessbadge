import type { ChessProvider } from "@elobadge/core";
import { LoaderCircle } from "lucide-react";
import type { ChessBadgePreferenceController } from "./useChessBadgePreference";

export function ChessBadgePreferenceControl({
  provider,
  preference
}: {
  provider: ChessProvider;
  preference: ChessBadgePreferenceController;
}) {
  const { state, error, savingProvider, select } = preference;
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
  const saving = savingProvider !== null;

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
      {savingProvider === provider ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />
      ) : null}
    </label>
  );
}
