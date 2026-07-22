import type { ChessComRating } from "./chesscom/client.js";
import type { LichessRating } from "./lichess/client.js";

const speedPriority = {
  bullet: 1,
  blitz: 2,
  rapid: 3,
  classical: 4
} as const;

type SupportedRating = Pick<
  ChessComRating | LichessRating,
  "speed" | "value"
>;

export function getHighestRating<T extends SupportedRating>(ratings: T[]): T | null {
  return ratings.reduce<T | null>((highest, rating) => {
    if (!highest || rating.value > highest.value) {
      return rating;
    }

    if (
      rating.value === highest.value &&
      speedPriority[rating.speed] > speedPriority[highest.speed]
    ) {
      return rating;
    }

    return highest;
  }, null);
}

export function getHighestChessComRating<T extends Pick<ChessComRating, "speed" | "value">>(
  ratings: T[]
): T | null {
  return getHighestRating(ratings);
}
