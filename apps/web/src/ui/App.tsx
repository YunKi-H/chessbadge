import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { LogOut, Radio, UserRound } from "lucide-react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { getFirebaseClientAuth } from "../firebase/client";

const navigation = [
  { to: "/streamer", label: "스트리머", icon: Radio },
  { to: "/viewer", label: "시청자", icon: UserRound }
] as const;

export function App() {
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(getFirebaseClientAuth(), (user) => {
      setSignedIn(Boolean(user));
    });
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);

    try {
      await signOut(getFirebaseClientAuth());
      void navigate("/", { replace: true });
    } catch {
      window.alert("로그아웃하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
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
            {signedIn ? (
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void handleSignOut()}
                className="ml-1 inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
              >
                <LogOut aria-hidden="true" size={16} />
                {signingOut ? "로그아웃 중" : "로그아웃"}
              </button>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
      <footer className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-sm text-slate-400 sm:px-6">
          <span>
            문의 및 오류 제보:{" "}
            <a
              href="mailto:support@elobadge.com"
              className="font-medium text-slate-300 transition hover:text-white"
            >
              support@elobadge.com
            </a>
          </span>
          <Link
            to="/privacy"
            className="font-medium text-slate-300 transition hover:text-white"
          >
            개인정보 처리방침
          </Link>
        </div>
      </footer>
    </div>
  );
}
