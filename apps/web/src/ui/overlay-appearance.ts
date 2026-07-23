import type {
  ChatOverlayEvent,
  OverlayAppearance,
  OverlayFontFamily
} from "@elobadge/core";
import { resolveRatingBadge, type RatingBadge } from "@elobadge/core";

export function overlayRating(
  appearance: OverlayAppearance,
  message: ChatOverlayEvent
): RatingBadge | null {
  return resolveRatingBadge(
    appearance.ratingProviderPolicy,
    message.ratings,
    message.preferredChessProvider
  );
}

const SYSTEM_FONT_FAMILY =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const OVERLAY_FONT_FAMILIES: Record<OverlayFontFamily, string> = {
  system: SYSTEM_FONT_FAMILY,
  pretendard: `"Pretendard", ${SYSTEM_FONT_FAMILY}`,
  "freesentation": `"Freesentation", ${SYSTEM_FONT_FAMILY}`,
  paperlogy: `"Paperlogy", ${SYSTEM_FONT_FAMILY}`,
  noto_sans_kr: `"Noto Sans KR", ${SYSTEM_FONT_FAMILY}`,
  aggro: `"Aggro", ${SYSTEM_FONT_FAMILY}`,
  nanum_square: `"NanumSquare", ${SYSTEM_FONT_FAMILY}`,
  nanum_square_neo: `"NanumSquareNeo", ${SYSTEM_FONT_FAMILY}`,
  nanum_square_round: `"NanumSquareRound", ${SYSTEM_FONT_FAMILY}`,
  jalnan: `"Jalnan", ${SYSTEM_FONT_FAMILY}`,
  maru_buri: `"MaruBuri", serif`,
  nanum_gothic: `"Nanum Gothic", ${SYSTEM_FONT_FAMILY}`,
  nanum_myeongjo: `"Nanum Myeongjo", serif`,
  chosun_gungseo: `"ChosunGungseo", serif`,
  mona12: `"Mona12", ${SYSTEM_FONT_FAMILY}`,
  dohyeon: `"Dohyeon", ${SYSTEM_FONT_FAMILY}`
};

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

  if (appearance.nicknameColorMode === "by_role") {
    return appearance.nicknameRoleColors[message.authorKind];
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

export function overlayMessageColor(
  appearance: OverlayAppearance,
  message: ChatOverlayEvent
): string {
  return appearance.messageColorMode === "by_role"
    ? appearance.messageRoleColors[message.authorKind]
    : appearance.messageColor;
}

export function overlayFontFamily(appearance: OverlayAppearance): string {
  return overlayFontFamilyValue(appearance.fontFamily);
}

export function overlayFontFamilyValue(fontFamily: OverlayFontFamily): string {
  return OVERLAY_FONT_FAMILIES[fontFamily];
}
