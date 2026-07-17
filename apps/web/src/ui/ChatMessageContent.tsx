import type { ChatOverlayEvent } from "@elobadge/core";
import { Fragment } from "react";

const CHZZK_EMOJI_TOKEN_PATTERN = /(\{:[^{}]+:\})/g;

export function ChatMessageContent({
  message,
  color
}: {
  message: ChatOverlayEvent;
  color: string;
}) {
  const emojisByToken = new Map(
    message.emojis.map((emoji) => [emoji.token, emoji.imageUrl])
  );
  const parts = message.content.split(CHZZK_EMOJI_TOKEN_PATTERN);

  return (
    <span
      className="min-w-0 break-words"
      style={{
        color,
        textShadow: "0 1px 2px rgb(0 0 0 / 85%)"
      }}
    >
      {parts.map((part, index) => {
        const imageUrl = emojisByToken.get(part);

        return imageUrl ? (
          <img
            key={`${index}:${part}`}
            src={imageUrl}
            alt={part}
            draggable={false}
            className="mx-0.5 inline-block size-[1.25em] align-[-0.22em] object-contain"
          />
        ) : (
          <Fragment key={index}>{part}</Fragment>
        );
      })}
    </span>
  );
}
