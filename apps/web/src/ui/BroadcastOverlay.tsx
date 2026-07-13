import { useEffect, useState } from "react";
import type { ChatOverlayEvent } from "@chessbadge/core";

const MESSAGE_LIFETIME_MS = 20_000;

export function BroadcastOverlay({ publicToken }: { publicToken: string }) {
  const [messages, setMessages] = useState<ChatOverlayEvent[]>([]);

  useEffect(() => {
    document.body.classList.add("broadcast-overlay-page");
    const events = new EventSource(`/events/overlay/${publicToken}`);
    const removalTimers = new Set<number>();

    events.addEventListener("chat", (event) => {
      const message = JSON.parse(event.data) as ChatOverlayEvent;
      setMessages((current) => [
        ...current.filter((item) => item.id !== message.id),
        message
      ].slice(-8));

      const timer = window.setTimeout(() => {
        setMessages((current) => current.filter((item) => item.id !== message.id));
        removalTimers.delete(timer);
      }, MESSAGE_LIFETIME_MS);
      removalTimers.add(timer);
    });

    events.addEventListener("revoked", () => {
      events.close();
      setMessages([]);
    });

    return () => {
      document.body.classList.remove("broadcast-overlay-page");
      events.close();
      removalTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [publicToken]);

  return (
    <main className="flex min-h-screen items-end bg-transparent p-6" aria-live="polite">
      <div className="w-full max-w-2xl space-y-2">
        {messages.map((message) => (
          <div
            key={message.id}
            className="overlay-message flex w-fit max-w-full items-center gap-2 rounded-md bg-slate-950/90 px-3 py-2 text-lg shadow-lg ring-1 ring-white/15"
          >
            {message.rating ? (
              <span className="shrink-0 rounded bg-emerald-400 px-2 py-1 text-sm font-bold text-slate-950">
                ♟ {message.rating.value}
              </span>
            ) : null}
            <span className="shrink-0 font-semibold text-sky-300">
              {message.nickname}:
            </span>
            <span className="min-w-0 break-words text-white">{message.content}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
