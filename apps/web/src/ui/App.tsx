import { Radio, UserRound } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/streamer", label: "스트리머", icon: Radio },
  { to: "/viewer", label: "시청자", icon: UserRound }
] as const;

export function App() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 bg-slate-950/80">
        <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-6">
          <Link to="/" className="text-lg font-semibold text-white">
            EloBadge
          </Link>
          <nav className="flex items-center gap-1" aria-label="주요 메뉴">
            {navigation.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition ${
                    isActive
                      ? "bg-emerald-500 text-slate-950"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`
                }
              >
                <Icon aria-hidden="true" size={16} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
