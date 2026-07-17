import type { ChzzkBadge, ChzzkBadgeVisibility } from "@elobadge/core";

export function ChzzkBadges({
  badges,
  visibility,
  lineHeight
}: {
  badges: ChzzkBadge[] | undefined;
  visibility: ChzzkBadgeVisibility;
  lineHeight: number;
}) {
  const visibleBadges = badges?.filter((badge) => visibility[badge.kind]);

  if (!visibleBadges?.length) {
    return null;
  }

  return (
    <span
      className="mr-[0.45em] inline-flex items-center gap-1 align-top"
      style={{ height: `${lineHeight}em` }}
      aria-label="치지직 배지"
    >
      {visibleBadges.map((badge) => (
        <img
          key={badge.imageUrl}
          src={badge.imageUrl}
          alt=""
          className="h-[1em] max-w-[3em] shrink-0 object-contain"
          referrerPolicy="no-referrer"
        />
      ))}
    </span>
  );
}
