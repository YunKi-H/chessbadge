import { useEffect, useState } from "react";
import type { ChatOverlayEvent } from "@chessbadge/core";

export function OverlayPreview() {
  const [messages, setMessages] = useState<ChatOverlayEvent[]>([]);

  useEffect(() => {
    const events = new EventSource("/events/test");

    events.addEventListener("chat", (event) => {
      const message = JSON.parse(event.data) as ChatOverlayEvent;
      setMessages((current) => [message, ...current].slice(0, 5));
    });

    return () => {
      events.close();
    };
  }, []);

  return (
    <section className="max-w-xl">
      <div className="space-y-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className="flex items-center gap-2 rounded-md bg-slate-900/80 px-3 py-2 shadow-lg ring-1 ring-white/10"
          >
            {message.rating ? (
              <span className="rounded bg-emerald-500 px-2 py-1 text-sm font-semibold text-slate-950">
                ♟ {message.rating.value}
              </span>
            ) : null}
            <span className="font-semibold text-sky-200">{message.nickname}:</span>
            <span className="text-slate-100">{message.content}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

