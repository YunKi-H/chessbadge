import assert from "node:assert/strict";
import test from "node:test";
import type { ChatOverlayEvent } from "@chessbadge/core";
import {
  publishChatOverlayEvent,
  subscribeStreamerChatOverlayEvents
} from "./overlay-events.js";

test("streamer event subscriptions do not receive another streamer's chat", () => {
  const received: ChatOverlayEvent[] = [];
  const unsubscribe = subscribeStreamerChatOverlayEvents(
    "streamer-a",
    (event) => received.push(event)
  );

  const event = chatEvent("message-a");
  publishChatOverlayEvent("streamer-b", chatEvent("message-b"));
  publishChatOverlayEvent("streamer-a", event);
  unsubscribe();
  publishChatOverlayEvent("streamer-a", chatEvent("message-after-unsubscribe"));

  assert.deepEqual(received, [event]);
});

function chatEvent(id: string): ChatOverlayEvent {
  return {
    id,
    nickname: "viewer",
    content: "message",
    rating: null,
    sentAt: "2026-07-14T00:00:00.000Z"
  };
}
