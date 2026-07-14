import type {
  ChatOverlayEvent,
  OverlayAppearance,
  RatingBadge
} from "@chessbadge/core";

export function parseChatOverlayEvent(data: unknown): ChatOverlayEvent | null {
  if (typeof data !== "string") {
    return null;
  }

  let value: unknown;

  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const event = value as Partial<ChatOverlayEvent>;

  if (
    typeof event.id !== "string" ||
    typeof event.nickname !== "string" ||
    typeof event.content !== "string" ||
    typeof event.sentAt !== "string" ||
    !isRatingBadge(event.rating)
  ) {
    return null;
  }

  return event as ChatOverlayEvent;
}

export function parseOverlayAppearanceEvent(
  data: unknown
): OverlayAppearance | null {
  if (typeof data !== "string") {
    return null;
  }

  let value: unknown;

  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const appearance = value as Partial<OverlayAppearance>;

  if (
    typeof appearance.backgroundVisible !== "boolean" ||
    typeof appearance.backgroundColor !== "string" ||
    !/^#[0-9A-Fa-f]{6}$/.test(appearance.backgroundColor) ||
    typeof appearance.backgroundOpacity !== "number" ||
    !Number.isInteger(appearance.backgroundOpacity) ||
    appearance.backgroundOpacity < 0 ||
    appearance.backgroundOpacity > 100 ||
    typeof appearance.nicknameVisible !== "boolean" ||
    (appearance.nicknameColorMode !== "fixed" &&
      appearance.nicknameColorMode !== "by_user") ||
    typeof appearance.nicknameColor !== "string" ||
    !/^#[0-9A-Fa-f]{6}$/.test(appearance.nicknameColor) ||
    typeof appearance.messageColor !== "string" ||
    !/^#[0-9A-Fa-f]{6}$/.test(appearance.messageColor)
  ) {
    return null;
  }

  return {
    backgroundVisible: appearance.backgroundVisible,
    backgroundColor: appearance.backgroundColor.toUpperCase(),
    backgroundOpacity: appearance.backgroundOpacity,
    nicknameVisible: appearance.nicknameVisible,
    nicknameColorMode: appearance.nicknameColorMode,
    nicknameColor: appearance.nicknameColor.toUpperCase(),
    messageColor: appearance.messageColor.toUpperCase()
  };
}

function isRatingBadge(value: unknown): value is RatingBadge | null {
  if (value === null) {
    return true;
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  const badge = value as Partial<RatingBadge>;
  return (
    (badge.provider === "chesscom" || badge.provider === "lichess") &&
    (badge.speed === "bullet" ||
      badge.speed === "blitz" ||
      badge.speed === "rapid" ||
      badge.speed === "classical") &&
    typeof badge.value === "number" &&
    typeof badge.provisional === "boolean"
  );
}
