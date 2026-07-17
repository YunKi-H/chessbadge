import type { ChzzkBadge, ChzzkBadgeVisibility } from "@elobadge/core";

export function ChzzkBadges({
  badges,
  visibility
}: {
  badges: ChzzkBadge[] | undefined;
  visibility: ChzzkBadgeVisibility;
}) {
  const visibleBadges = badges?.filter((badge) => visibility[badge.kind]);

  if (!visibleBadges?.length) {
    return null;
  }

  return (
    <span
      className="mt-0.5 flex shrink-0 items-center gap-1"
      aria-label="치지직 배지"
    >
      {visibleBadges.map((badge) => (
        <img
          key={badge.imageUrl}
          src={badge.imageUrl}
          alt=""
          className="h-5 max-w-[3.75rem] shrink-0 object-contain"
          referrerPolicy="no-referrer"
        />
      ))}
    </span>
  );
}
