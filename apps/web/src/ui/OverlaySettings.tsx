import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  type ChatAuthorKind,
  type ChzzkBadgeKind,
  DEFAULT_OVERLAY_APPEARANCE,
  type OverlayAppearance,
  type OverlayFontFamily,
  type OverlayFontLineHeight,
  type OverlayFontWeight,
  type OverlayMessageDurationSeconds
} from "@elobadge/core";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  Link,
  PaintBucket,
  Palette,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  Type
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
import { overlayFontFamilyValue } from "./overlay-appearance";

type SettingsState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "ready"; overlay: OverlayAccess | null }
  | { status: "error"; message: string };

type AppearanceSection =
  | "general"
  | "badges"
  | "background"
  | "colors"
  | "fonts";

type ExpandedAppearanceSections = Record<AppearanceSection, boolean>;

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

const APPEARANCE_SECTIONS_STORAGE_KEY =
  "elobadge.streamer.appearance-sections";

const DEFAULT_EXPANDED_APPEARANCE_SECTIONS: ExpandedAppearanceSections = {
  general: true,
  badges: true,
  background: true,
  colors: true,
  fonts: true
};

const MESSAGE_DURATION_OPTIONS = [10, 20, 30, 60, 0] as const;

const FONT_FAMILY_OPTIONS: ReadonlyArray<{
  value: OverlayFontFamily;
  label: string;
}> = [
  { value: "system", label: "시스템 기본" },
  { value: "pretendard", label: "프리텐다드" },
  { value: "freesentation", label: "프리젠테이션" },
  { value: "paperlogy", label: "페이퍼로지" },
  { value: "noto_sans_kr", label: "본고딕" },
  { value: "aggro", label: "어그로체" },
  { value: "nanum_square", label: "나눔스퀘어" },
  { value: "nanum_square_neo", label: "나눔스퀘어 네오" },
  { value: "nanum_square_round", label: "나눔스퀘어 라운드" },
  { value: "jalnan", label: "여기어때 잘난체" },
  { value: "maru_buri", label: "마루 부리" },
  { value: "nanum_gothic", label: "나눔고딕" },
  { value: "nanum_myeongjo", label: "나눔명조" },
  { value: "chosun_gungseo", label: "조선궁서체" },
  { value: "mona12", label: "Mona12" },
  { value: "dohyeon", label: "도현체" }
];

const FONT_WEIGHT_OPTIONS: ReadonlyArray<OverlayFontWeight> = [
  400,
  500,
  600,
  700,
  900
];

const FONT_LINE_HEIGHT_OPTIONS: ReadonlyArray<OverlayFontLineHeight> = [
  1.2,
  1.4,
  1.6
];

const FONT_PREVIEW_TEXT = "동해물과 백두산이 마르고 닳도록...";

const CHAT_AUTHOR_KIND_OPTIONS: ReadonlyArray<{
  kind: ChatAuthorKind;
  label: string;
}> = [
  { kind: "streamer", label: "스트리머" },
  { kind: "manager", label: "매니저" },
  { kind: "subscriber", label: "구독자" },
  { kind: "donator", label: "후원자" },
  { kind: "viewer", label: "일반 시청자" }
];

const CHZZK_BADGE_KIND_OPTIONS: ReadonlyArray<{
  kind: ChzzkBadgeKind;
  label: string;
}> = [
  { kind: "role", label: "스트리머·매니저" },
  { kind: "subscription", label: "구독" },
  { kind: "donation", label: "후원" },
  { kind: "subscription_gift", label: "구독 선물" },
  { kind: "unknown", label: "기타" }
];

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
  const [expandedSections, setExpandedSections] = useState(
    readExpandedAppearanceSections
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
          setExpandedSections({ ...DEFAULT_EXPANDED_APPEARANCE_SECTIONS });
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
      setExpandedSections({ ...DEFAULT_EXPANDED_APPEARANCE_SECTIONS });
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

  const toggleAppearanceSection = (section: AppearanceSection) => {
    setExpandedSections((current) => {
      const next = { ...current, [section]: !current[section] };

      try {
        window.localStorage.setItem(
          APPEARANCE_SECTIONS_STORAGE_KEY,
          JSON.stringify(next)
        );
      } catch {
        // The disclosure still works when browser storage is unavailable.
      }

      return next;
    });
  };

  const updateRoleColor = (kind: ChatAuthorKind, color: string) => {
    if (!overlay) {
      return;
    }

    updateAppearanceDraft({
      nicknameRoleColors: {
        ...overlay.appearance.nicknameRoleColors,
        [kind]: color.toUpperCase()
      }
    });
  };

  const updateMessageRoleColor = (kind: ChatAuthorKind, color: string) => {
    if (!overlay) {
      return;
    }

    updateAppearanceDraft({
      messageRoleColors: {
        ...overlay.appearance.messageRoleColors,
        [kind]: color.toUpperCase()
      }
    });
  };

  const updateBadgeVisibility = (kind: ChzzkBadgeKind, visible: boolean) => {
    if (!overlay) {
      return;
    }

    updateAppearanceDraft({
      chzzkBadgeVisibility: {
        ...overlay.appearance.chzzkBadgeVisibility,
        [kind]: visible
      }
    });
  };

  return (
    <section className="mb-10 max-w-2xl border-y border-white/10 py-6">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <Link aria-hidden="true" className="text-emerald-300" size={20} />
          <h2 className="text-lg font-semibold text-white">OBS 오버레이</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          OBS 브라우저 소스 너비 600px에 최적화되어 있습니다. 높이는 방송
          화면에 맞게 설정하세요.
        </p>
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

          <div className="border-t border-white/10">
            <SettingsDisclosure
              id="overlay-general-settings"
              title="기본 설정"
              icon={<Clock3 aria-hidden="true" size={18} />}
              expanded={expandedSections.general}
              onToggle={() => toggleAppearanceSection("general")}
            >
                <label className="flex items-center justify-between gap-4 text-sm font-medium text-slate-200">
                  채팅 표시 시간
                  <select
                    value={overlay.appearance.messageDurationSeconds}
                    onChange={(event) =>
                      updateAppearanceDraft({
                        messageDurationSeconds: Number(
                          event.target.value
                        ) as OverlayMessageDurationSeconds
                      })
                    }
                    className="h-9 rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-400"
                  >
                    {MESSAGE_DURATION_OPTIONS.map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {seconds === 0
                          ? "계속 유지"
                          : `${seconds}초${seconds === 20 ? " (기본)" : ""}`}
                      </option>
                    ))}
                  </select>
                </label>
            </SettingsDisclosure>

            <SettingsDisclosure
              id="overlay-badge-settings"
              title="치지직 배지"
              icon={<BadgeCheck aria-hidden="true" size={18} />}
              expanded={expandedSections.badges}
              onToggle={() => toggleAppearanceSection("badges")}
            >
                <label className="flex items-center justify-between gap-4 text-sm font-medium text-slate-200">
                  치지직 배지 전체 표시
                  <input
                    type="checkbox"
                    checked={overlay.appearance.chzzkBadgesVisible}
                    onChange={(event) =>
                      updateAppearanceDraft({
                        chzzkBadgesVisible: event.target.checked
                      })
                    }
                    className="size-4 accent-emerald-500"
                  />
                </label>

                <fieldset
                  disabled={!overlay.appearance.chzzkBadgesVisible}
                  className="disabled:opacity-40"
                >
                  <legend className="mb-3 text-sm font-medium text-slate-200">
                    표시할 배지
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {CHZZK_BADGE_KIND_OPTIONS.map(({ kind, label }) => (
                      <label
                        key={kind}
                        className="flex h-10 items-center justify-between gap-3 rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-slate-300"
                      >
                        {label}
                        <input
                          type="checkbox"
                          checked={
                            overlay.appearance.chzzkBadgeVisibility[kind]
                          }
                          onChange={(event) =>
                            updateBadgeVisibility(kind, event.target.checked)
                          }
                          className="size-4 accent-emerald-500"
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
            </SettingsDisclosure>

            <SettingsDisclosure
              id="overlay-background-settings"
              title="채팅 배경"
              icon={<PaintBucket aria-hidden="true" size={18} />}
              expanded={expandedSections.background}
              onToggle={() => toggleAppearanceSection("background")}
            >
              <label className="flex items-center justify-between gap-4 text-sm font-medium text-slate-200">
                배경 표시
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
            </SettingsDisclosure>

            <SettingsDisclosure
              id="overlay-color-settings"
              title="채팅 색상"
              icon={<Palette aria-hidden="true" size={18} />}
              expanded={expandedSections.colors}
              onToggle={() => toggleAppearanceSection("colors")}
            >
              <div className="space-y-5">
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
                    ["by_user", "사용자별"],
                    ["by_role", "역할별"]
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

                {overlay.appearance.nicknameColorMode === "by_role" ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {CHAT_AUTHOR_KIND_OPTIONS.map(({ kind, label }) => (
                      <label
                        key={kind}
                        className="flex h-10 items-center justify-between gap-3 rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-slate-300"
                      >
                        {label}
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-500">
                            {overlay.appearance.nicknameRoleColors[kind]}
                          </span>
                          <input
                            type="color"
                            aria-label={`${label} 닉네임 색상`}
                            value={overlay.appearance.nicknameRoleColors[kind]}
                            onChange={(event) =>
                              updateRoleColor(kind, event.target.value)
                            }
                            className="size-7 cursor-pointer rounded border border-white/20 bg-transparent p-0.5"
                          />
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </fieldset>

              <fieldset className="border-t border-white/10 pt-5">
                <legend className="mb-3 text-sm font-medium text-slate-200">
                  메시지 색상
                </legend>
                <div className="inline-flex rounded-md bg-slate-950 p-1 ring-1 ring-white/10">
                  {([
                    ["fixed", "단일 색상"],
                    ["by_role", "유형별"]
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={overlay.appearance.messageColorMode === mode}
                      onClick={() =>
                        updateAppearanceDraft({ messageColorMode: mode })
                      }
                      className={`h-8 rounded px-3 text-sm font-medium transition ${overlay.appearance.messageColorMode === mode ? "bg-emerald-500 text-slate-950" : "text-slate-300 hover:text-white"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {overlay.appearance.messageColorMode === "fixed" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {MESSAGE_COLOR_SWATCHES.map((color) => (
                      <button
                        key={color}
                        type="button"
                        title={color}
                        aria-label={`메시지 색상 ${color}`}
                        aria-pressed={overlay.appearance.messageColor === color}
                        onClick={() =>
                          updateAppearanceDraft({ messageColor: color })
                        }
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
                ) : null}

                {overlay.appearance.messageColorMode === "by_role" ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {CHAT_AUTHOR_KIND_OPTIONS.map(({ kind, label }) => (
                      <label
                        key={kind}
                        className="flex h-10 items-center justify-between gap-3 rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-slate-300"
                      >
                        {label}
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-500">
                            {overlay.appearance.messageRoleColors[kind]}
                          </span>
                          <input
                            type="color"
                            aria-label={`${label} 메시지 색상`}
                            value={overlay.appearance.messageRoleColors[kind]}
                            onChange={(event) =>
                              updateMessageRoleColor(kind, event.target.value)
                            }
                            className="size-7 cursor-pointer rounded border border-white/20 bg-transparent p-0.5"
                          />
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </fieldset>
              </div>
            </SettingsDisclosure>

            <SettingsDisclosure
              id="overlay-font-settings"
              title="채팅 폰트"
              icon={<Type aria-hidden="true" size={18} />}
              expanded={expandedSections.fonts}
              onToggle={() => toggleAppearanceSection("fonts")}
            >
              <FontFamilySelect
                value={overlay.appearance.fontFamily}
                onChange={(fontFamily) =>
                  updateAppearanceDraft({ fontFamily })
                }
              />

              <label className="grid gap-2 text-sm font-medium text-slate-200">
                <span className="flex items-center justify-between gap-4">
                  글자 크기
                  <output className="tabular-nums text-slate-400">
                    {overlay.appearance.fontSizePx}px
                  </output>
                </span>
                <input
                  type="range"
                  min={12}
                  max={36}
                  step={1}
                  value={overlay.appearance.fontSizePx}
                  onChange={(event) =>
                    updateAppearanceDraft({
                      fontSizePx: Number(event.target.value)
                    })
                  }
                  className="w-full accent-emerald-500"
                />
              </label>

              <fieldset>
                <legend className="mb-3 text-sm font-medium text-slate-200">
                  글자 굵기
                </legend>
                <div className="inline-flex flex-wrap rounded-md bg-slate-950 p-1 ring-1 ring-white/10">
                  {FONT_WEIGHT_OPTIONS.map((weight) => (
                    <button
                      key={weight}
                      type="button"
                      aria-pressed={overlay.appearance.fontWeight === weight}
                      onClick={() =>
                        updateAppearanceDraft({ fontWeight: weight })
                      }
                      className={`h-8 rounded px-3 text-sm transition ${overlay.appearance.fontWeight === weight ? "bg-emerald-500 text-slate-950" : "text-slate-300 hover:text-white"}`}
                    >
                      {weight}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="flex items-center justify-between gap-4 text-sm font-medium text-slate-200">
                줄 간격
                <select
                  value={overlay.appearance.fontLineHeight}
                  onChange={(event) =>
                    updateAppearanceDraft({
                      fontLineHeight: Number(
                        event.target.value
                      ) as OverlayFontLineHeight
                    })
                  }
                  className="h-9 rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-emerald-400"
                >
                  {FONT_LINE_HEIGHT_OPTIONS.map((lineHeight) => (
                    <option key={lineHeight} value={lineHeight}>
                      {lineHeight}
                    </option>
                  ))}
                </select>
              </label>
            </SettingsDisclosure>

            <div className="flex flex-wrap gap-2 pt-5">
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
        </div>
      ) : null}
    </section>
  );
}

function SettingsDisclosure({
  id,
  title,
  icon,
  expanded,
  onToggle,
  children
}: {
  id: string;
  title: string;
  icon: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-white/10 py-4">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span className="flex items-center gap-2 text-sky-300">
          {icon}
          <span className="font-semibold text-white">{title}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          size={18}
          className={`shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded ? (
        <div id={id} className="mt-4 space-y-5 pl-0 sm:pl-7">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function FontFamilySelect({
  value,
  onChange
}: {
  value: OverlayFontFamily;
  onChange: (value: OverlayFontFamily) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedLabel =
    FONT_FAMILY_OPTIONS.find((option) => option.value === value)?.label ??
    "시스템 기본";

  useEffect(() => {
    if (!expanded) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setExpanded(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded]);

  return (
    <div ref={containerRef} className="relative grid gap-2">
      <span className="text-sm font-medium text-slate-200">폰트</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls="overlay-font-options"
        onClick={() => setExpanded((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-left text-base text-white outline-none transition hover:border-white/25 focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/30"
      >
        <span
          className="min-w-0 truncate"
          style={{ fontFamily: overlayFontFamilyValue(value) }}
        >
          {selectedLabel} - {FONT_PREVIEW_TEXT}
        </span>
        <ChevronDown
          aria-hidden="true"
          size={18}
          className={`shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded ? (
        <div
          id="overlay-font-options"
          role="listbox"
          aria-label="채팅 폰트"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-md border border-white/10 bg-slate-950 py-1 shadow-xl shadow-black/40"
        >
          {FONT_FAMILY_OPTIONS.map((option) => {
            const selected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value);
                  setExpanded(false);
                }}
                className={`flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-base transition ${selected ? "bg-emerald-400/10 text-emerald-200" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
              >
                <span
                  className="min-w-0 truncate"
                  style={{ fontFamily: overlayFontFamilyValue(option.value) }}
                >
                  {option.label} - {FONT_PREVIEW_TEXT}
                </span>
                {selected ? (
                  <Check aria-hidden="true" size={17} className="shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function readExpandedAppearanceSections(): ExpandedAppearanceSections {
  try {
    const stored = window.localStorage.getItem(APPEARANCE_SECTIONS_STORAGE_KEY);

    if (!stored) {
      return { ...DEFAULT_EXPANDED_APPEARANCE_SECTIONS };
    }

    const parsed: unknown = JSON.parse(stored);

    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_EXPANDED_APPEARANCE_SECTIONS };
    }

    const sections = parsed as Partial<ExpandedAppearanceSections>;

    return {
      general:
        typeof sections.general === "boolean" ? sections.general : true,
      badges: typeof sections.badges === "boolean" ? sections.badges : true,
      background:
        typeof sections.background === "boolean" ? sections.background : true,
      colors: typeof sections.colors === "boolean" ? sections.colors : true,
      fonts: typeof sections.fonts === "boolean" ? sections.fonts : true
    };
  } catch {
    return { ...DEFAULT_EXPANDED_APPEARANCE_SECTIONS };
  }
}

function toErrorState(error: unknown): SettingsState {
  return {
    status: "error",
    message: error instanceof Error ? error.message : "요청에 실패했습니다."
  };
}
