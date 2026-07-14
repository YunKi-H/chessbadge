import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="py-16">
      <p className="text-sm font-medium text-slate-400">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">
        페이지를 찾을 수 없습니다
      </h1>
      <Link
        to="/"
        className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-slate-800 px-4 font-semibold text-white ring-1 ring-white/10 transition hover:bg-slate-700"
      >
        <ArrowLeft aria-hidden="true" size={17} />
        홈으로
      </Link>
    </section>
  );
}
