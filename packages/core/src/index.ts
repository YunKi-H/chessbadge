export type ChessProvider = "lichess" | "chesscom";

export type ChzzkLoginMode = "streamer" | "viewer";

export type NicknameColorMode = "fixed" | "by_user" | "by_role";

export type MessageColorMode = "fixed" | "by_role";

export const OVERLAY_FONT_FAMILY_VALUES = [
  "system",
  "pretendard",
  "freesentation",
  "paperlogy",
  "noto_sans_kr",
  "aggro",
  "nanum_square",
  "nanum_square_neo",
  "nanum_square_round",
  "jalnan",
  "maru_buri",
  "nanum_gothic",
  "nanum_myeongjo",
  "chosun_gungseo",
  "mona12",
  "dohyeon"
] as const;

export type OverlayFontFamily =
  (typeof OVERLAY_FONT_FAMILY_VALUES)[number];

export function isOverlayFontFamily(
  value: unknown
): value is OverlayFontFamily {
  return (
    typeof value === "string" &&
    (OVERLAY_FONT_FAMILY_VALUES as readonly string[]).includes(value)
  );
}

export type OverlayFontWeight = 400 | 500 | 600 | 700 | 900;

export type OverlayFontLineHeight = 1.2 | 1.4 | 1.6;

export type ChatAuthorKind =
  | "streamer"
  | "manager"
  | "donator"
  | "subscriber"
  | "viewer";

export type ChatAuthorColors = Record<ChatAuthorKind, string>;

export type OverlayMessageDurationSeconds = 0 | 10 | 20 | 30 | 60;

export const MAX_OVERLAY_MESSAGES = 30;

export type ChessSpeed = "bullet" | "blitz" | "rapid" | "classical";

export interface RatingBadge {
  provider: ChessProvider;
  speed: ChessSpeed;
  value: number;
  provisional: boolean;
}

export type ChzzkBadgeKind =
  | "role"
  | "subscription"
  | "donation"
  | "subscription_gift"
  | "unknown";

export type ChzzkBadgeVisibility = Record<ChzzkBadgeKind, boolean>;

export interface ChzzkBadge {
  kind: ChzzkBadgeKind;
  imageUrl: string;
}

export interface ChzzkEmoji {
  token: string;
  imageUrl: string;
}

export interface ChatOverlayEvent {
  id: string;
  nickname: string;
  content: string;
  rating: RatingBadge | null;
  chzzkBadges?: ChzzkBadge[];
  emojis: ChzzkEmoji[];
  authorKind: ChatAuthorKind;
  sentAt: string;
  source?: {
    provider: "chzzk";
    channelId: string;
    senderChannelId: string;
    messageTime: number;
  };
}

export interface OverlayAppearance {
  backgroundVisible: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  chzzkBadgesVisible: boolean;
  chzzkBadgeVisibility: ChzzkBadgeVisibility;
  nicknameVisible: boolean;
  nicknameColorMode: NicknameColorMode;
  nicknameColor: string;
  nicknameRoleColors: ChatAuthorColors;
  messageColorMode: MessageColorMode;
  messageColor: string;
  messageRoleColors: ChatAuthorColors;
  fontFamily: OverlayFontFamily;
  fontSizePx: number;
  fontWeight: OverlayFontWeight;
  fontLineHeight: OverlayFontLineHeight;
  messageDurationSeconds: OverlayMessageDurationSeconds;
}

export const DEFAULT_OVERLAY_APPEARANCE: OverlayAppearance = {
  backgroundVisible: true,
  backgroundColor: "#020617",
  backgroundOpacity: 90,
  chzzkBadgesVisible: true,
  chzzkBadgeVisibility: {
    role: true,
    subscription: true,
    donation: true,
    subscription_gift: true,
    unknown: true
  },
  nicknameVisible: true,
  nicknameColorMode: "fixed",
  nicknameColor: "#7DD3FC",
  nicknameRoleColors: {
    streamer: "#34D399",
    manager: "#60A5FA",
    donator: "#FBBF24",
    subscriber: "#C084FC",
    viewer: "#E2E8F0"
  },
  messageColorMode: "fixed",
  messageColor: "#FFFFFF",
  messageRoleColors: {
    streamer: "#86EFAC",
    manager: "#93C5FD",
    donator: "#FDE68A",
    subscriber: "#D8B4FE",
    viewer: "#FFFFFF"
  },
  fontFamily: "system",
  fontSizePx: 18,
  fontWeight: 400,
  fontLineHeight: 1.4,
  messageDurationSeconds: 20
};
