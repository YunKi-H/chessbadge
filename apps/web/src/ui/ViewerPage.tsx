import { UserRound } from "lucide-react";
import { ChessComAccountSettings } from "./ChessComAccountSettings";
import { LichessAccountSettings } from "./LichessAccountSettings";
import { AccountDeletion } from "./AccountDeletion";
import { useChessBadgePreference } from "./useChessBadgePreference";

export function ViewerPage() {
  const badgePreference = useChessBadgePreference();

  return (
    <div>
      <header className="mb-8">
        <div className="flex items-center gap-2 text-sky-300">
          <UserRound aria-hidden="true" size={18} />
          <span className="text-sm font-medium">시청자</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-white">체스 계정</h1>
      </header>
      <ChessComAccountSettings badgePreference={badgePreference} />
      <LichessAccountSettings badgePreference={badgePreference} />
      <AccountDeletion />
    </div>
  );
}
