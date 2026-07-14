import { useEffect, useState } from "react";
import type { ChatOverlayEvent } from "@chessbadge/core";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseClientAuth } from "../firebase/client";
import { parseChatOverlayEvent } from "../realtime/chat-event";
import { RatingBadge } from "./RatingBadge";

export function OverlayPreview() {
  const [messages, setMessages] = useState<ChatOverlayEvent[]>([]);

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
        setMessages((current) => [message, ...current].slice(0, 5));
      });
    });

    return () => {
      unsubscribeAuth();
      events?.close();
    };
  }, []);

  return (
    <section className="max-w-xl">
      {messages.length === 0 ? (
        <div className="border-l-2 border-slate-700 py-2 pl-4 text-sm text-slate-400">
          채팅 수신 대기 중
        </div>
      ) : null}
      <div className="space-y-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className="flex items-center gap-2 rounded-md bg-slate-900/80 px-3 py-2 shadow-lg ring-1 ring-white/10"
          >
            {message.rating ? (
              <RatingBadge rating={message.rating} />
            ) : null}
            <span className="font-semibold text-sky-200">{message.nickname}:</span>
            <span className="text-slate-100">{message.content}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
