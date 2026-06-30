import { OverlayPreview } from "./OverlayPreview";

export function App() {
  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8">
          <p className="text-sm font-medium text-emerald-300">ChessBadge</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-white">
            Chzzk chess rating overlay
          </h1>
        </header>
        <OverlayPreview />
      </div>
    </main>
  );
}

