import { Radio, UserRound } from "lucide-react";
import { OverlayPreview } from "./OverlayPreview";
import { ChzzkAuthCallback } from "./ChzzkAuthCallback";
import { OverlaySettings } from "./OverlaySettings";

export function App() {
  if (window.location.pathname === "/auth/chzzk/callback") {
    return <ChzzkAuthCallback />;
  }

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <p className="text-sm font-medium text-emerald-300">ChessBadge</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-white">
            Chzzk chess rating overlay
          </h1>
        </header>
        <section className="mb-10 flex flex-wrap gap-3" aria-label="치지직 계정 연결">
          <a
            href="/api/auth/chzzk/start?mode=streamer"
            className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            <Radio aria-hidden="true" size={18} />
            스트리머로 연결
          </a>
          <a
            href="/api/auth/chzzk/start?mode=viewer"
            className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-4 py-2 font-semibold text-slate-100 ring-1 ring-white/10 transition hover:bg-slate-700"
          >
            <UserRound aria-hidden="true" size={18} />
            시청자로 연결
          </a>
        </section>
        {window.location.pathname === "/streamer" ? <OverlaySettings /> : null}
        <OverlayPreview />
      </div>
    </main>
  );
}
