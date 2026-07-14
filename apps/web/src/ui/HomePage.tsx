import { ArrowRight, Radio, UserRound } from "lucide-react";
import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <div>
      <header className="max-w-2xl border-b border-white/10 pb-8">
        <h1 className="text-3xl font-semibold text-white">ChessBadge</h1>
        <p className="mt-3 text-base leading-7 text-slate-300">
          치지직 채팅에 시청자의 Chess.com 레이팅을 표시합니다.
        </p>
      </header>

      <div className="grid border-b border-white/10 md:grid-cols-2 md:divide-x md:divide-white/10">
        <section className="py-8 md:pr-8">
          <Radio className="text-emerald-300" aria-hidden="true" size={24} />
          <h2 className="mt-4 text-xl font-semibold text-white">방송 설정</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            치지직 채팅을 연결하고 OBS 오버레이 주소를 관리합니다.
          </p>
          <Link
            to="/streamer"
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-emerald-500 px-4 font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            스트리머 화면
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </section>

        <section className="border-t border-white/10 py-8 md:border-t-0 md:pl-8">
          <UserRound className="text-sky-300" aria-hidden="true" size={24} />
          <h2 className="mt-4 text-xl font-semibold text-white">레이팅 연결</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            치지직 계정과 Chess.com 계정을 연결하고 레이팅을 관리합니다.
          </p>
          <Link
            to="/viewer"
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-slate-800 px-4 font-semibold text-white ring-1 ring-white/10 transition hover:bg-slate-700"
          >
            시청자 화면
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </section>
      </div>
    </div>
  );
}
