import { useState } from "react";
import {
  DEFAULT_OVERLAY_APPEARANCE,
  type OverlayAppearance
} from "@elobadge/core";
import { signOut } from "firebase/auth";
import { Radio, Unplug } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { disconnectChzzkConnection } from "../api/client";
import { getFirebaseClientAuth } from "../firebase/client";
import { OverlayPreview } from "./OverlayPreview";
import { OverlaySettings } from "./OverlaySettings";

export function StreamerPage() {
  const navigate = useNavigate();
  const [appearance, setAppearance] = useState<OverlayAppearance>({
    ...DEFAULT_OVERLAY_APPEARANCE
  });
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    if (
      !window.confirm(
        "치지직 연결과 저장된 방송용 토큰을 해제할까요? 다시 사용하려면 스트리머 로그인이 필요합니다."
      )
    ) {
      return;
    }

    setDisconnecting(true);

    try {
      await disconnectChzzkConnection();
      await signOut(getFirebaseClientAuth());
      void navigate("/", { replace: true });
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "치지직 연결을 해제하지 못했습니다."
      );
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div>
      <header className="mb-8">
        <div className="flex items-center gap-2 text-emerald-300">
          <Radio aria-hidden="true" size={18} />
          <span className="text-sm font-medium">스트리머</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-white">방송 오버레이</h1>
      </header>

      <OverlaySettings onAppearanceChange={setAppearance} />

      <section className="max-w-2xl py-2">
        <h2 className="mb-4 text-lg font-semibold text-white">채팅 미리보기</h2>
        <OverlayPreview appearance={appearance} />
      </section>

      <div className="mt-10 border-t border-white/10 pt-6">
        <button
          type="button"
          disabled={disconnecting}
          onClick={() => void handleDisconnect()}
          className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-red-300 transition hover:bg-red-500/10 hover:text-red-200 disabled:opacity-50"
        >
          <Unplug aria-hidden="true" size={16} />
          {disconnecting ? "연결 해제 중" : "치지직 연결 해제"}
        </button>
      </div>
    </div>
  );
}
