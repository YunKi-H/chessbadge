import type { ChessComRating } from "./chesscom/client.js";

const speedPriority: Record<ChessComRating["speed"], number> = {
  bullet: 1,
  blitz: 2,
  rapid: 3
};

export function getHighestChessComRating<T extends Pick<ChessComRating, "speed" | "value">>(
  ratings: T[]
): T | null {
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
