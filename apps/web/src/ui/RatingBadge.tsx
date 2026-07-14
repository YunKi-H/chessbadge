import type { RatingBadge as RatingBadgeData } from "@chessbadge/core";

export function RatingBadge({ rating }: { rating: RatingBadgeData }) {
  const providerName = rating.provider === "chesscom" ? "Chess.com" : "Lichess";

  return (
    <span
      className="mt-0.5 flex shrink-0 items-center gap-1 rounded bg-white px-1.5 py-0.5 text-xs font-bold leading-none text-slate-950 shadow-sm ring-1 ring-black/10"
      aria-label={`${providerName} rating ${rating.value}`}
      title={`${providerName} ${rating.speed} rating`}
    >
      {rating.provider === "chesscom" ? (
        <img
          src="/chess-com-logo.svg"
          alt=""
          className="size-4 shrink-0"
          width="16"
          height="16"
        />
      ) : (
        <span aria-hidden="true">♟</span>
      )}
      <span>{rating.value}</span>
    </span>
  );
}
