import { useEffect, useState } from "react";
import {
  DEFAULT_OVERLAY_APPEARANCE,
  type OverlayAppearance
} from "@elobadge/core";
import {
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Link,
  Palette,
  Power,
  RefreshCw,
  RotateCcw,
  Save
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import {
  disableOverlayAccess,
  enableOverlayAccess,
  getOverlayAccess,
  rotateOverlayAccess,
  updateOverlayAppearance,
  type OverlayAccess
} from "../api/client";
import { getFirebaseClientAuth } from "../firebase/client";

type SettingsState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "ready"; overlay: OverlayAccess | null }
  | { status: "error"; message: string };

const MESSAGE_COLOR_SWATCHES = [
  "#FFFFFF",
  "#E2E8F0",
  "#FDE047",
  "#86EFAC",
  "#7DD3FC"
] as const;

const BACKGROUND_COLOR_SWATCHES = [
  "#020617",
  "#0F172A",
  "#172554",
  "#052E16",
  "#3F1D2E"
] as const;

const NICKNAME_COLOR_SWATCHES = [
  "#7DD3FC",
  "#86EFAC",
  "#FDE047",
  "#FDA4AF",
  "#C4B5FD",
  "#FDBA74"
] as const;

const APPEARANCE_EXPANDED_STORAGE_KEY =
  "elobadge.streamer.appearance-expanded";

export function OverlaySettings({
  onAppearanceChange
}: {
  onAppearanceChange: (appearance: OverlayAppearance) => void;
}) {
  const [state, setState] = useState<SettingsState>({ status: "loading" });
  const [updating, setUpdating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [urlVisible, setUrlVisible] = useState(false);
  const [appearanceDirty, setAppearanceDirty] = useState(false);
  const [appearanceExpanded, setAppearanceExpanded] = useState(
    readAppearanceExpanded
  );

  useEffect(() => {
    return onAuthStateChanged(getFirebaseClientAuth(), (user) => {
      setUrlVisible(false);

      if (!user) {
        setState({ status: "signed_out" });
        return;
      }

      void getOverlayAccess()
        .then((overlay) => {
          setState({ status: "ready", overlay });
          if (overlay) {
            onAppearanceChange(overlay.appearance);
          }
        })
        .catch((error: unknown) => {
          setAppearanceExpanded(true);
          setState(toErrorState(error));
        });
    });
  }, [onAppearanceChange]);

  const runUpdate = async (operation: () => Promise<OverlayAccess | null>) => {
    setUpdating(true);
    setCopied(false);
    setUrlVisible(false);

    try {
      const overlay = await operation();
      setState({ status: "ready", overlay });
      setAppearanceDirty(false);
      if (overlay) {
        onAppearanceChange(overlay.appearance);
      }
    } catch (error) {
      setAppearanceExpanded(true);
      setState(toErrorState(error));
    } finally {
      setUpdating(false);
    }
  };

  const overlay = state.status === "ready" ? state.overlay : null;

  const updateAppearanceDraft = (patch: Partial<OverlayAppearance>) => {
    if (!overlay) {
      return;
    }

    const appearance = { ...overlay.appearance, ...patch };
    setState({
      status: "ready",
      overlay: { ...overlay, appearance }
    });
    setAppearanceDirty(true);
    onAppearanceChange(appearance);
  };

  const toggleAppearanceExpanded = () => {
    setAppearanceExpanded((current) => {
      const next = !current;

      try {
        window.localStorage.setItem(
          APPEARANCE_EXPANDED_STORAGE_KEY,
          String(next)
        );
      } catch {
        // The disclosure still works when browser storage is unavailable.
      }

      return next;
    });
  };

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
              value={urlVisible ? overlay.url : "********************"}
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none"
            />
            <button
              type="button"
              title={urlVisible ? "URL 숨기기" : "URL 표시"}
              aria-label={urlVisible ? "URL 숨기기" : "URL 표시"}
              aria-pressed={urlVisible}
              onClick={() => setUrlVisible((current) => !current)}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-800 text-white hover:bg-slate-700"
            >
              {urlVisible ? (
                <EyeOff aria-hidden="true" size={18} />
              ) : (
                <Eye aria-hidden="true" size={18} />
              )}
            </button>
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

          <div className="border-t border-white/10 pt-5">
            <button
              type="button"
              aria-expanded={appearanceExpanded}
              aria-controls="overlay-appearance-settings"
              onClick={toggleAppearanceExpanded}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <span className="flex items-center gap-2">
                <Palette aria-hidden="true" className="text-sky-300" size={18} />
                <span className="font-semibold text-white">채팅 화면</span>
              </span>
              <ChevronDown
                aria-hidden="true"
                size={18}
                className={`shrink-0 text-slate-400 transition-transform ${appearanceExpanded ? "rotate-180" : ""}`}
              />
            </button>

            {appearanceExpanded ? (
              <div
                id="overlay-appearance-settings"
                className="mt-5 space-y-5"
              >
              <label className="flex items-center justify-between gap-4 text-sm font-medium text-slate-200">
                채팅 배경
                <input
                  type="checkbox"
                  checked={overlay.appearance.backgroundVisible}
                  onChange={(event) =>
                    updateAppearanceDraft({
                      backgroundVisible: event.target.checked
                    })
                  }
                  className="size-4 accent-emerald-500"
                />
              </label>

              <fieldset
                disabled={!overlay.appearance.backgroundVisible}
                className="disabled:opacity-40"
              >
                <legend className="mb-3 text-sm font-medium text-slate-200">
                  배경 색상
                </legend>
                <div className="flex flex-wrap items-center gap-2">
                  {BACKGROUND_COLOR_SWATCHES.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={color}
                      aria-label={`배경 색상 ${color}`}
                      aria-pressed={overlay.appearance.backgroundColor === color}
                      onClick={() =>
                        updateAppearanceDraft({ backgroundColor: color })
                      }
                      className={`size-8 rounded-md border transition ${overlay.appearance.backgroundColor === color ? "border-emerald-400 ring-2 ring-emerald-400/30" : "border-white/20"}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    title="직접 배경 색상 선택"
                    aria-label="직접 배경 색상 선택"
                    value={overlay.appearance.backgroundColor}
                    onChange={(event) =>
                      updateAppearanceDraft({
                        backgroundColor: event.target.value.toUpperCase()
                      })
                    }
                    className="size-8 cursor-pointer rounded-md border border-white/20 bg-transparent p-0.5"
                  />
                </div>
              </fieldset>

              <label className="grid gap-2 text-sm font-medium text-slate-200">
                <span className="flex items-center justify-between gap-4">
                  배경 불투명도
                  <output className="tabular-nums text-slate-400">
                    {overlay.appearance.backgroundOpacity}%
                  </output>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  disabled={!overlay.appearance.backgroundVisible}
                  value={overlay.appearance.backgroundOpacity}
                  onChange={(event) =>
                    updateAppearanceDraft({
                      backgroundOpacity: Number(event.target.value)
                    })
                  }
                  className="w-full accent-emerald-500 disabled:opacity-40"
                />
              </label>

              <label className="flex items-center justify-between gap-4 text-sm font-medium text-slate-200">
                닉네임 표시
                <input
                  type="checkbox"
                  checked={overlay.appearance.nicknameVisible}
                  onChange={(event) =>
                    updateAppearanceDraft({
                      nicknameVisible: event.target.checked
                    })
                  }
                  className="size-4 accent-emerald-500"
                />
              </label>

              <fieldset
                disabled={!overlay.appearance.nicknameVisible}
                className="disabled:opacity-40"
              >
                <legend className="mb-3 text-sm font-medium text-slate-200">
                  닉네임 색상
                </legend>
                <div className="inline-flex rounded-md bg-slate-950 p-1 ring-1 ring-white/10">
                  {([
                    ["fixed", "단일 색상"],
                    ["by_user", "사용자별"]
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={overlay.appearance.nicknameColorMode === mode}
                      onClick={() =>
                        updateAppearanceDraft({ nicknameColorMode: mode })
                      }
                      className={`h-8 rounded px-3 text-sm font-medium transition ${overlay.appearance.nicknameColorMode === mode ? "bg-emerald-500 text-slate-950" : "text-slate-300 hover:text-white"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {overlay.appearance.nicknameColorMode === "fixed" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {NICKNAME_COLOR_SWATCHES.map((color) => (
                      <button
                        key={color}
                        type="button"
                        title={color}
                        aria-label={`닉네임 색상 ${color}`}
                        aria-pressed={overlay.appearance.nicknameColor === color}
                        onClick={() =>
                          updateAppearanceDraft({ nicknameColor: color })
                        }
                        className={`size-8 rounded-md border transition ${overlay.appearance.nicknameColor === color ? "border-emerald-400 ring-2 ring-emerald-400/30" : "border-white/20"}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                    <input
                      type="color"
                      title="직접 닉네임 색상 선택"
                      aria-label="직접 닉네임 색상 선택"
                      value={overlay.appearance.nicknameColor}
                      onChange={(event) =>
                        updateAppearanceDraft({
                          nicknameColor: event.target.value.toUpperCase()
                        })
                      }
                      className="size-8 cursor-pointer rounded-md border border-white/20 bg-transparent p-0.5"
                    />
                  </div>
                ) : null}
              </fieldset>

              <fieldset>
                <legend className="mb-3 text-sm font-medium text-slate-200">
                  메시지 색상
                </legend>
                <div className="flex flex-wrap items-center gap-2">
                  {MESSAGE_COLOR_SWATCHES.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={color}
                      aria-label={`메시지 색상 ${color}`}
                      aria-pressed={overlay.appearance.messageColor === color}
                      onClick={() => updateAppearanceDraft({ messageColor: color })}
                      className={`size-8 rounded-md border transition ${overlay.appearance.messageColor === color ? "border-emerald-400 ring-2 ring-emerald-400/30" : "border-white/20"}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    title="직접 색상 선택"
                    aria-label="직접 메시지 색상 선택"
                    value={overlay.appearance.messageColor}
                    onChange={(event) =>
                      updateAppearanceDraft({
                        messageColor: event.target.value.toUpperCase()
                      })
                    }
                    className="size-8 cursor-pointer rounded-md border border-white/20 bg-transparent p-0.5"
                  />
                </div>
              </fieldset>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!appearanceDirty || updating}
                  onClick={() =>
                    void runUpdate(() =>
                      updateOverlayAppearance(overlay.appearance)
                    )
                  }
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-500 px-4 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Save aria-hidden="true" size={17} />
                  화면 설정 저장
                </button>
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => {
                    if (
                      window.confirm(
                        "채팅 화면 설정을 모두 기본값으로 초기화할까요?"
                      )
                    ) {
                      void runUpdate(() =>
                        updateOverlayAppearance({
                          ...DEFAULT_OVERLAY_APPEARANCE
                        })
                      );
                    }
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-800 px-4 font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RotateCcw aria-hidden="true" size={17} />
                  기본값으로 초기화
                </button>
              </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function readAppearanceExpanded(): boolean {
  try {
    const stored = window.localStorage.getItem(
      APPEARANCE_EXPANDED_STORAGE_KEY
    );
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

function toErrorState(error: unknown): SettingsState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : "요청에 실패했습니다."
  };
}
