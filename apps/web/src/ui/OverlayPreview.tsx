import { type FormEvent, useEffect, useRef, useState } from "react";
import type {
  ChatAuthorKind,
  ChatOverlayEvent,
  ChessProvider,
  OverlayAppearance
} from "@elobadge/core";
import { onAuthStateChanged } from "firebase/auth";
import { Check, ChevronDown, Send } from "lucide-react";
import { getFirebaseClientAuth } from "../firebase/client";
import { parseChatOverlayEvent } from "../realtime/chat-event";
import { RatingBadge } from "./RatingBadge";
import {
  overlayBackgroundColor,
  overlayFontFamily,
  overlayMessageColor,
  overlayNicknameColor,
  overlayRating
} from "./overlay-appearance";
import { ChzzkBadges } from "./ChzzkBadges";
import { ChatMessageContent } from "./ChatMessageContent";
import { useOverlayMessageQueue } from "./useOverlayMessageQueue";

const AUTHOR_KIND_OPTIONS: ReadonlyArray<{
  value: ChatAuthorKind;
  label: string;
}> = [
  { value: "streamer", label: "스트리머" },
  { value: "manager", label: "매니저" },
  { value: "subscriber", label: "구독자" },
  { value: "donator", label: "후원자" },
  { value: "viewer", label: "일반 시청자" }
];

export function OverlayPreview({ appearance }: { appearance: OverlayAppearance }) {
  const { messages, addMessage } = useOverlayMessageQueue(
    appearance.messageDurationSeconds
  );
  const [nickname, setNickname] = useState("");
  const [rating, setRating] = useState("");
  const [ratingProvider, setRatingProvider] =
    useState<ChessProvider>("chesscom");
  const [authorKind, setAuthorKind] = useState<ChatAuthorKind>("viewer");
  const [content, setContent] = useState("");

  useEffect(() => {
    let events: EventSource | null = null;

    const unsubscribeAuth = onAuthStateChanged(getFirebaseClientAuth(), (user) => {
      events?.close();
      const query = user ? `?streamerUid=${encodeURIComponent(user.uid)}` : "";
      events = new EventSource(`/events/test${query}`);

      events.addEventListener("chat", (event) => {
        const message = parseChatOverlayEvent(event.data);

        if (!message) {
          return;
        }
        addMessage(message);
      });
    });

    return () => {
      unsubscribeAuth();
      events?.close();
    };
  }, [addMessage]);

  const addPreviewMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedNickname = nickname.trim();
    const trimmedContent = content.trim();
    const ratingValue = rating === "" ? null : Number(rating);

    if (
      !trimmedNickname ||
      !trimmedContent ||
      (ratingValue !== null &&
        (!Number.isInteger(ratingValue) || ratingValue < 100 || ratingValue > 4000))
    ) {
      return;
    }

    const message: ChatOverlayEvent = {
      id: `preview-${crypto.randomUUID()}`,
      nickname: trimmedNickname,
      content: trimmedContent,
      ratings:
        ratingValue === null
          ? {}
          : {
              [ratingProvider]: {
                provider: ratingProvider,
                speed: "rapid",
                value: ratingValue,
                provisional: false
              }
            },
      preferredChessProvider: ratingValue === null ? null : ratingProvider,
      authorKind,
      emojis: [],
      sentAt: new Date().toISOString()
    };

    addMessage(message);
    setContent("");
  };

  return (
    <section className="max-w-[600px]">
      <div className="flex aspect-video w-full flex-col justify-end overflow-hidden rounded-md bg-slate-950/60 p-4 ring-1 ring-white/10">
        {messages.length === 0 ? (
          <div className="border-l-2 border-slate-700 py-2 pl-4 text-sm text-slate-400">
            아직 표시할 메시지가 없습니다
          </div>
        ) : null}
        <div
          className={`flex min-h-0 w-full flex-col justify-end overflow-hidden ${appearance.backgroundVisible ? "gap-2" : "gap-1"}`}
          style={{ maxWidth: `${appearance.messageMaxWidthPx}px` }}
        >
          {messages.map((message) => {
            const resolvedRating = overlayRating(appearance, message);
            return (
            <div
              key={message.id}
              className={`w-fit max-w-full min-w-0 shrink-0 rounded-md ${appearance.backgroundVisible ? "px-3 py-2 shadow-lg ring-1 ring-white/10" : "p-0"}`}
              style={{
                overflowWrap: "anywhere",
                backgroundColor: overlayBackgroundColor(appearance),
                fontFamily: overlayFontFamily(appearance),
                fontSize: `${appearance.fontSizePx}px`,
                fontWeight: appearance.fontWeight,
                lineHeight: appearance.fontLineHeight
              }}
            >
              {appearance.chzzkBadgesVisible ? (
                <ChzzkBadges
                  badges={message.chzzkBadges}
                  visibility={appearance.chzzkBadgeVisibility}
                  lineHeight={appearance.fontLineHeight}
                />
              ) : null}
              {resolvedRating ? (
                <RatingBadge
                  rating={resolvedRating}
                  lineHeight={appearance.fontLineHeight}
                />
              ) : null}
              {appearance.nicknameVisible ? (
                <span
                  className="mr-[0.45em]"
                  style={{ color: overlayNicknameColor(appearance, message) }}
                >
                  {message.nickname}:
                </span>
              ) : null}
              <ChatMessageContent
                message={message}
                color={overlayMessageColor(appearance, message)}
              />
            </div>
            );
          })}
        </div>
      </div>

      <form
        onSubmit={addPreviewMessage}
        className="mt-4 grid gap-3"
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_10rem]">
          <label className="grid gap-1.5 text-sm font-medium text-slate-300">
            닉네임
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={30}
              required
              placeholder="시청자 닉네임"
              className="h-10 min-w-0 rounded-md border border-white/10 bg-slate-950 px-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-300">
            레이팅
            <input
              type="number"
              value={rating}
              onChange={(event) => setRating(event.target.value)}
              min={100}
              max={4000}
              step={1}
              placeholder="선택 사항"
              className="h-10 min-w-0 rounded-md border border-white/10 bg-slate-950 px-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
            />
          </label>
          <AuthorKindSelect value={authorKind} onChange={setAuthorKind} />
        </div>
        <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
          <RatingProviderRadioGroup
            value={ratingProvider}
            onChange={setRatingProvider}
          />
          <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-300">
            메시지
            <span className="flex min-w-0 gap-2">
              <input
                value={content}
                onChange={(event) => setContent(event.target.value)}
                maxLength={200}
                required
                placeholder="미리보기 메시지 입력"
                className="h-10 min-w-0 flex-1 rounded-md border border-white/10 bg-slate-950 px-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
              />
              <button
                type="submit"
                title="미리보기 추가"
                aria-label="미리보기 추가"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-500 text-slate-950 transition hover:bg-emerald-400"
              >
                <Send aria-hidden="true" size={18} />
              </button>
            </span>
          </label>
        </div>
      </form>
    </section>
  );
}

function AuthorKindSelect({
  value,
  onChange
}: {
  value: ChatAuthorKind;
  onChange: (value: ChatAuthorKind) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedLabel =
    AUTHOR_KIND_OPTIONS.find((option) => option.value === value)?.label ??
    "일반 시청자";

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
    <div ref={containerRef} className="relative grid gap-1.5">
      <span className="text-sm font-medium text-slate-300">역할</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls="overlay-preview-author-options"
        onClick={() => setExpanded((current) => !current)}
        className="flex h-10 min-w-0 items-center justify-between gap-2 rounded-md border border-white/10 bg-slate-950 px-3 text-left text-white outline-none transition hover:border-white/25 focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/30"
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <ChevronDown
          aria-hidden="true"
          size={17}
          className={`shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded ? (
        <div
          id="overlay-preview-author-options"
          role="listbox"
          aria-label="채팅 미리보기 역할"
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-white/10 bg-slate-950 py-1 shadow-xl shadow-black/40"
        >
          {AUTHOR_KIND_OPTIONS.map((option) => {
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
                className={`flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${selected ? "bg-emerald-400/10 text-emerald-200" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {selected ? (
                  <Check aria-hidden="true" size={16} className="shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function RatingProviderRadioGroup({
  value,
  onChange
}: {
  value: ChessProvider;
  onChange: (value: ChessProvider) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby="preview-rating-provider-label"
      className="grid gap-1.5"
    >
      <span
        id="preview-rating-provider-label"
        className="text-sm font-medium text-slate-300"
      >
        배지 유형
      </span>
      <span className="flex items-center gap-2">
        <RatingProviderRadio
          provider="chesscom"
          label="Chess.com"
          selected={value === "chesscom"}
          onChange={onChange}
        />
        <RatingProviderRadio
          provider="lichess"
          label="Lichess"
          selected={value === "lichess"}
          onChange={onChange}
        />
      </span>
    </div>
  );
}

function RatingProviderRadio({
  provider,
  label,
  selected,
  onChange
}: {
  provider: ChessProvider;
  label: string;
  selected: boolean;
  onChange: (value: ChessProvider) => void;
}) {
  return (
    <label
      title={label}
      className={`inline-flex size-10 cursor-pointer items-center justify-center rounded-md ring-1 transition focus-within:ring-2 focus-within:ring-emerald-300 ${selected ? "bg-emerald-400/10 ring-emerald-400/40" : "bg-slate-950 ring-white/15 hover:bg-slate-900 hover:ring-white/25"}`}
    >
      <input
        type="radio"
        name="preview-rating-provider"
        value={provider}
        checked={selected}
        onChange={() => onChange(provider)}
        aria-label={`${label} 배지`}
        className="sr-only"
      />
      <img
        src={provider === "chesscom" ? "/chess-com-logo.svg" : "/lichess-logo.svg"}
        alt=""
        className={`size-5 shrink-0 ${provider === "lichess" ? "brightness-0 invert" : ""}`}
      />
    </label>
  );
}
