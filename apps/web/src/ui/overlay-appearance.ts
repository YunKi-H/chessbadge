import type { ChatOverlayEvent, OverlayAppearance } from "@chessbadge/core";

const USER_NICKNAME_COLORS = [
  "#7DD3FC",
  "#86EFAC",
  "#FDE047",
  "#FDA4AF",
  "#C4B5FD",
  "#FDBA74",
  "#67E8F9",
  "#F0ABFC"
] as const;

export function overlayBackgroundColor(
  appearance: OverlayAppearance
): string {
  if (!appearance.backgroundVisible) {
    return "transparent";
  }

  const red = Number.parseInt(appearance.backgroundColor.slice(1, 3), 16);
  const green = Number.parseInt(appearance.backgroundColor.slice(3, 5), 16);
  const blue = Number.parseInt(appearance.backgroundColor.slice(5, 7), 16);

  return `rgb(${red} ${green} ${blue} / ${appearance.backgroundOpacity}%)`;
}

export function overlayNicknameColor(
  appearance: OverlayAppearance,
  message: ChatOverlayEvent
): string {
  if (appearance.nicknameColorMode === "fixed") {
    return appearance.nicknameColor;
  }

  const identity = (
    message.source?.senderChannelId ?? message.nickname
  ).normalize("NFKC");
  let hash = 2_166_136_261;

  for (let index = 0; index < identity.length; index += 1) {
    hash = Math.imul(hash ^ identity.charCodeAt(index), 16_777_619) >>> 0;
  }

  return USER_NICKNAME_COLORS[hash % USER_NICKNAME_COLORS.length]!;
}
