import type {
  ChatAuthorKind,
  ChatOverlayEvent,
  ChzzkBadge,
  ChzzkBadgeKind,
  ChzzkEmoji,
  OverlayAppearance,
  RatingBadge
} from "@elobadge/core";

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

  const chzzkBadges = parseChzzkBadges(event.chzzkBadges);
  const emojis = parseChzzkEmojis(event.emojis);
  const authorKind = parseChatAuthorKind(event.authorKind);

  if (!chzzkBadges || !emojis || !authorKind) {
    return null;
  }

  return {
    ...(event as ChatOverlayEvent),
    chzzkBadges,
    emojis,
    authorKind
  };
}

function parseChzzkEmojis(value: unknown): ChzzkEmoji[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > 50) {
    return null;
  }

  const emojis: ChzzkEmoji[] = [];

  for (const emoji of value) {
    if (!emoji || typeof emoji !== "object") {
      return null;
    }

    const parsed = emoji as Partial<ChzzkEmoji>;

    if (
      typeof parsed.token !== "string" ||
      !/^\{:[^{}]{1,100}:\}$/.test(parsed.token) ||
      typeof parsed.imageUrl !== "string" ||
      !isHttpsUrl(parsed.imageUrl)
    ) {
      return null;
    }

    emojis.push({ token: parsed.token, imageUrl: parsed.imageUrl });
  }

  return emojis;
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
    typeof appearance.chzzkBadgesVisible !== "boolean" ||
    !isChzzkBadgeVisibility(appearance.chzzkBadgeVisibility) ||
    typeof appearance.nicknameVisible !== "boolean" ||
    (appearance.nicknameColorMode !== "fixed" &&
      appearance.nicknameColorMode !== "by_user" &&
      appearance.nicknameColorMode !== "by_role") ||
    typeof appearance.nicknameColor !== "string" ||
    !/^#[0-9A-Fa-f]{6}$/.test(appearance.nicknameColor) ||
    !isChatAuthorColors(appearance.nicknameRoleColors) ||
    (appearance.messageColorMode !== "fixed" &&
      appearance.messageColorMode !== "by_role") ||
    typeof appearance.messageColor !== "string" ||
    !/^#[0-9A-Fa-f]{6}$/.test(appearance.messageColor) ||
    !isChatAuthorColors(appearance.messageRoleColors) ||
    (appearance.messageDurationSeconds !== 0 &&
      appearance.messageDurationSeconds !== 10 &&
      appearance.messageDurationSeconds !== 20 &&
      appearance.messageDurationSeconds !== 30 &&
      appearance.messageDurationSeconds !== 60)
  ) {
    return null;
  }

  return {
    backgroundVisible: appearance.backgroundVisible,
    backgroundColor: appearance.backgroundColor.toUpperCase(),
    backgroundOpacity: appearance.backgroundOpacity,
    chzzkBadgesVisible: appearance.chzzkBadgesVisible,
    chzzkBadgeVisibility: { ...appearance.chzzkBadgeVisibility },
    nicknameVisible: appearance.nicknameVisible,
    nicknameColorMode: appearance.nicknameColorMode,
    nicknameColor: appearance.nicknameColor.toUpperCase(),
    nicknameRoleColors: {
      streamer: appearance.nicknameRoleColors.streamer.toUpperCase(),
      manager: appearance.nicknameRoleColors.manager.toUpperCase(),
      donator: appearance.nicknameRoleColors.donator.toUpperCase(),
      subscriber: appearance.nicknameRoleColors.subscriber.toUpperCase(),
      viewer: appearance.nicknameRoleColors.viewer.toUpperCase()
    },
    messageColorMode: appearance.messageColorMode,
    messageColor: appearance.messageColor.toUpperCase(),
    messageRoleColors: {
      streamer: appearance.messageRoleColors.streamer.toUpperCase(),
      manager: appearance.messageRoleColors.manager.toUpperCase(),
      donator: appearance.messageRoleColors.donator.toUpperCase(),
      subscriber: appearance.messageRoleColors.subscriber.toUpperCase(),
      viewer: appearance.messageRoleColors.viewer.toUpperCase()
    },
    messageDurationSeconds: appearance.messageDurationSeconds
  };
}

function isChzzkBadgeVisibility(
  value: unknown
): value is OverlayAppearance["chzzkBadgeVisibility"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const visibility = value as Partial<
    OverlayAppearance["chzzkBadgeVisibility"]
  >;

  return [
    visibility.role,
    visibility.subscription,
    visibility.donation,
    visibility.subscription_gift,
    visibility.unknown
  ].every((visible) => typeof visible === "boolean");
}

function parseChatAuthorKind(value: unknown): ChatAuthorKind | null {
  return value === "streamer" ||
    value === "manager" ||
    value === "donator" ||
    value === "subscriber" ||
    value === "viewer"
    ? value
    : null;
}

function isChatAuthorColors(
  value: unknown
): value is OverlayAppearance["nicknameRoleColors"] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const colors = value as Partial<OverlayAppearance["nicknameRoleColors"]>;
  return [
    colors.streamer,
    colors.manager,
    colors.donator,
    colors.subscriber,
    colors.viewer
  ].every(
    (color) => typeof color === "string" && /^#[0-9A-Fa-f]{6}$/.test(color)
  );
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

function parseChzzkBadges(value: unknown): ChzzkBadge[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.length > 10) {
    return null;
  }

  const badges: ChzzkBadge[] = [];

  for (const badge of value) {
    if (!badge || typeof badge !== "object") {
      return null;
    }

    const parsed = badge as Partial<ChzzkBadge>;
    const imageUrl = parsed.imageUrl;
    const kind =
      parsed.kind === undefined ? "unknown" : parseChzzkBadgeKind(parsed.kind);

    if (!kind || typeof imageUrl !== "string" || !isHttpsUrl(imageUrl)) {
      return null;
    }

    badges.push({ kind, imageUrl });
  }

  return badges;
}

function parseChzzkBadgeKind(value: unknown): ChzzkBadgeKind | null {
  return value === "role" ||
    value === "subscription" ||
    value === "donation" ||
    value === "subscription_gift" ||
    value === "unknown"
    ? value
    : null;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
