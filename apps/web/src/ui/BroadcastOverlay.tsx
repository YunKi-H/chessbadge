import { useEffect, useState } from "react";
import {
  DEFAULT_OVERLAY_APPEARANCE,
  type OverlayAppearance
} from "@elobadge/core";
import {
  parseChatOverlayEvent,
  parseOverlayAppearanceEvent
} from "../realtime/chat-event";
import { RatingBadge } from "./RatingBadge";
import {
  overlayBackgroundColor,
  overlayFontFamily,
  overlayMessageColor,
  overlayNicknameColor
} from "./overlay-appearance";
import { ChzzkBadges } from "./ChzzkBadges";
import { ChatMessageContent } from "./ChatMessageContent";
import { useOverlayMessageQueue } from "./useOverlayMessageQueue";

export function BroadcastOverlay({ publicToken }: { publicToken: string }) {
  const [appearance, setAppearance] = useState<OverlayAppearance>({
    ...DEFAULT_OVERLAY_APPEARANCE
  });
  const { messages, addMessage, clearMessages } = useOverlayMessageQueue(
    appearance.messageDurationSeconds
  );

  useEffect(() => {
    document.body.classList.add("broadcast-overlay-page");
    const events = new EventSource(`/events/overlay/${publicToken}`);

    events.addEventListener("chat", (event) => {
      const message = parseChatOverlayEvent(event.data);

      if (!message) {
        return;
      }
      addMessage(message);
    });

    events.addEventListener("appearance", (event) => {
      const nextAppearance = parseOverlayAppearanceEvent(event.data);

      if (nextAppearance) {
        setAppearance(nextAppearance);
      }
    });

    events.addEventListener("revoked", () => {
      events.close();
      clearMessages();
    });

    return () => {
      document.body.classList.remove("broadcast-overlay-page");
      events.close();
    };
  }, [addMessage, clearMessages, publicToken]);

  return (
    <main
      className="flex h-screen items-end overflow-hidden bg-transparent p-6"
      aria-live="polite"
    >
      <div
        className={`flex max-h-full w-full max-w-[600px] flex-col justify-end overflow-hidden ${appearance.backgroundVisible ? "gap-2" : "gap-1"}`}
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`overlay-message w-fit max-w-full shrink-0 rounded-md ${appearance.backgroundVisible ? "px-3 py-2 shadow-lg ring-1 ring-white/15" : "p-0"}`}
            style={{
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
            {message.rating ? (
              <RatingBadge
                rating={message.rating}
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
        ))}
      </div>
    </main>
  );
}
