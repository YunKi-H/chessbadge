import { LoaderCircle } from "lucide-react";

export function RouteLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-slate-300">
      <LoaderCircle className="mr-2 animate-spin" aria-hidden="true" size={18} />
      화면을 불러오는 중
    </main>
  );
}
