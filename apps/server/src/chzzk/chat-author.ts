import type { ChatAuthorKind } from "@elobadge/core";
import { classifyChzzkBadge } from "./badge-classifier.js";

export function classifyChzzkChatAuthor(profile: {
  userRoleCode?: string;
  badges?: unknown[];
}): ChatAuthorKind {
  if (profile.userRoleCode === "streamer") {
    return "streamer";
  }

  if (
    profile.userRoleCode === "streaming_channel_manager" ||
    profile.userRoleCode === "streaming_chat_manager"
  ) {
    return "manager";
  }

  const badgeKinds = (profile.badges ?? []).map(classifyChzzkBadge);

  if (badgeKinds.includes("subscription")) {
    return "subscriber";
  }

  if (badgeKinds.includes("donation")) {
    return "donator";
  }

  return "viewer";
}
