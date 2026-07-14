import { Radio } from "lucide-react";
import { OverlayPreview } from "./OverlayPreview";
import { OverlaySettings } from "./OverlaySettings";

export function StreamerPage() {
  return (
    <div>
      <header className="mb-8">
        <div className="flex items-center gap-2 text-emerald-300">
          <Radio aria-hidden="true" size={18} />
          <span className="text-sm font-medium">스트리머</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-white">방송 오버레이</h1>
      </header>

      <OverlaySettings />

      <section className="max-w-2xl py-2">
        <h2 className="mb-4 text-lg font-semibold text-white">채팅 미리보기</h2>
        <OverlayPreview />
      </section>
    </div>
  );
}
