import { type FormEvent, useEffect, useState } from "react";
import type {
  ChatAuthorKind,
  ChatOverlayEvent,
  OverlayAppearance
} from "@elobadge/core";
import { onAuthStateChanged } from "firebase/auth";
import { Send } from "lucide-react";
import { getFirebaseClientAuth } from "../firebase/client";
import { parseChatOverlayEvent } from "../realtime/chat-event";
import { RatingBadge } from "./RatingBadge";
import {
  overlayBackgroundColor,
  overlayNicknameColor
} from "./overlay-appearance";
import { ChzzkBadges } from "./ChzzkBadges";
import { ChatMessageContent } from "./ChatMessageContent";
import { useOverlayMessageQueue } from "./useOverlayMessageQueue";

export function OverlayPreview({ appearance }: { appearance: OverlayAppearance }) {
  const { messages, addMessage } = useOverlayMessageQueue(
    appearance.messageDurationSeconds
  );
  const [nickname, setNickname] = useState("");
  const [rating, setRating] = useState("");
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
      rating:
        ratingValue === null
          ? null
          : {
              provider: "chesscom",
              speed: "rapid",
              value: ratingValue,
              provisional: false
            },
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
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex w-fit max-w-full min-w-0 shrink-0 items-start gap-2 rounded-md ${appearance.backgroundVisible ? "px-3 py-2 shadow-lg ring-1 ring-white/10" : "p-0"}`}
              style={{
                backgroundColor: overlayBackgroundColor(appearance)
              }}
            >
              {appearance.chzzkBadgesVisible ? (
                <ChzzkBadges badges={message.chzzkBadges} />
              ) : null}
              {message.rating ? (
                <RatingBadge rating={message.rating} />
              ) : null}
              {appearance.nicknameVisible ? (
                <span
                  className="max-w-40 shrink-0 truncate font-semibold"
                  style={{ color: overlayNicknameColor(appearance, message) }}
                >
                  {message.nickname}:
                </span>
              ) : null}
              <ChatMessageContent
                message={message}
                color={appearance.messageColor}
              />
            </div>
          ))}
        </div>
      </div>

      <form
        onSubmit={addPreviewMessage}
        className="mt-6 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-[minmax(0,1fr)_8rem_9rem]"
      >
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
        <label className="grid gap-1.5 text-sm font-medium text-slate-300">
          역할
          <select
            value={authorKind}
            onChange={(event) =>
              setAuthorKind(event.target.value as ChatAuthorKind)
            }
            className="h-10 min-w-0 rounded-md border border-white/10 bg-slate-950 px-3 text-white outline-none focus:border-emerald-400"
          >
            <option value="streamer">스트리머</option>
            <option value="manager">매니저</option>
            <option value="donator">후원자</option>
            <option value="subscriber">구독자</option>
            <option value="viewer">일반 시청자</option>
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-300 sm:col-span-3">
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
      </form>
    </section>
  );
}
