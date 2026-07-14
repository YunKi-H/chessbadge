export type ChessProvider = "lichess" | "chesscom";

export type ChzzkLoginMode = "streamer" | "viewer";

export type NicknameColorMode = "fixed" | "by_user";

export type ChessSpeed = "bullet" | "blitz" | "rapid" | "classical";

export interface RatingBadge {
  provider: ChessProvider;
  speed: ChessSpeed;
  value: number;
  provisional: boolean;
}

export interface ChatOverlayEvent {
  id: string;
  nickname: string;
  content: string;
  rating: RatingBadge | null;
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
  nicknameVisible: boolean;
  nicknameColorMode: NicknameColorMode;
  nicknameColor: string;
  messageColor: string;
}

export const DEFAULT_OVERLAY_APPEARANCE: OverlayAppearance = {
  backgroundVisible: true,
  backgroundColor: "#020617",
  backgroundOpacity: 90,
  nicknameVisible: true,
  nicknameColorMode: "fixed",
  nicknameColor: "#7DD3FC",
  messageColor: "#FFFFFF"
};
