export type ChessProvider = "lichess" | "chesscom";

export type ChzzkLoginMode = "streamer" | "viewer";

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
