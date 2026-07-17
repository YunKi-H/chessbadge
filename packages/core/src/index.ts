export type ChessProvider = "lichess" | "chesscom";

export type ChzzkLoginMode = "streamer" | "viewer";

export type NicknameColorMode = "fixed" | "by_user" | "by_role";

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
  nicknameVisible: boolean;
  nicknameColorMode: NicknameColorMode;
  nicknameColor: string;
  nicknameRoleColors: ChatAuthorColors;
  messageColor: string;
  messageDurationSeconds: OverlayMessageDurationSeconds;
}

export const DEFAULT_OVERLAY_APPEARANCE: OverlayAppearance = {
  backgroundVisible: true,
  backgroundColor: "#020617",
  backgroundOpacity: 90,
  chzzkBadgesVisible: true,
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
  messageColor: "#FFFFFF",
  messageDurationSeconds: 20
};
