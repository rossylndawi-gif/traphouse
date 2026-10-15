"use client";

/*
 * Wraps every /admin page: checks the login, lets in only users listed in the
 * admins table (everyone else is signed out), and shows the bottom tab bar.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { asset } from "@/lib/config";
import { supabase } from "@/lib/supabase";

type Status = "loading" | "out" | "admin";
type AdminState = {
  email: string;
  toast: (msg: string) => void;
  signOut: () => Promise<void>;
  /** Waiting (not yet expired) website orders, for the tab badge. */
  pending: number;
  refreshPending: () => void;
};
const AdminCtx = createContext<AdminState | null>(null);
export const useAdmin = () => {
  const v = useContext(AdminCtx);
  if (!v) throw new Error("useAdmin used outside AdminShell");
  return v;
};

/** Message shown on the login page after we sign someone out. */
export const FLASH_KEY = "ths-admin-flash";

const TABS = [
  { href: "/admin/", label: "Home" },
  { href: "/admin/inventory/", label: "Stock" },
  { href: "/admin/orders/", label: "Orders" },
  { href: "/admin/sale/", label: "Sell" },
  { href: "/admin/sales/", label: "Sales" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const path = (usePathname() ?? "").replace(/\/$/, "") || "/";
  const router = useRouter();
  const onLogin = path === "/admin/login";
  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState("");

  /* who is logged in, and are they an admin? */
  useEffect(() => {
    const sb = supabase();
    let live = true;
    const check = async () => {
      const { data } = await sb.auth.getSession();
      const session = data.session;
      if (!session) return live && setStatus("out");
      const { data: ok, error } = await sb.rpc("is_admin");
      if (!live) return;
      if (error) {
        // offline or Supabase down: don't sign them out; each page shows its own "can't load" error
        // (the database still refuses non-admins whatever the screen shows)
        console.warn("[admin] is_admin failed:", error.message);
        setEmail(session.user.email ?? "");
        return setStatus("admin");
      }
      if (!ok) {
        try {
          sessionStorage.setItem(FLASH_KEY, "This account doesn't have access to the shop admin.");
        } catch {}
        await sb.auth.signOut();
        return live && setStatus("out");
      }
      setEmail(session.user.email ?? "");
      setStatus("admin");
    };
    check();
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      // re-check on a fresh screen (so the login page re-reads any message); deferred because
      // calling Supabase inside this callback can deadlock
      // (only when nobody was logged in: SIGNED_IN also fires when the tab becomes visible
      // again, e.g. back from the camera, and must not wipe a half-filled form)
      if (event === "SIGNED_IN") setStatus((s) => (s === "admin" ? s : "loading"));
      setTimeout(check, 0);
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status === "out" && !onLogin) router.replace("/admin/login/");
    if (status === "admin" && onLogin) router.replace("/admin/");
  }, [status, onLogin, router]);

  /* toast */
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((m: string) => {
    setMessage(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 2800);
  }, []);

  /* pending orders badge */
  const [pending, setPending] = useState(0);
  const refreshPending = useCallback(() => {
    supabase()
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .then(({ count }) => setPending(count ?? 0));
  }, []);
  useEffect(() => {
    if (status !== "admin") return;
    refreshPending();
    const t = setInterval(refreshPending, 60_000);
    return () => clearInterval(t);
  }, [status, refreshPending, path]);

  const signOut = useCallback(async () => {
    await supabase().auth.signOut();
    setStatus("out");
  }, []);

  const value = useMemo(() => ({ email, toast, signOut, pending, refreshPending }), [email, toast, signOut, pending, refreshPending]);

  if (onLogin) {
    return (
      <div className="min-h-dvh bg-white">
        {status === "loading" || status === "admin" ? <Splash /> : children}
      </div>
    );
  }
  if (status !== "admin") return <Splash />;

  return (
    <AdminCtx.Provider value={value}>
      <div className="min-h-dvh bg-white pb-[calc(76px+env(safe-area-inset-bottom,0px))]">
        <header className="sticky top-0 z-40 flex h-[calc(56px+env(safe-area-inset-top,0px))] items-center justify-between border-b border-fg bg-white/95 px-4 pt-[env(safe-area-inset-top,0px)] backdrop-blur">
          <Link href="/admin/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset("logo.png")} alt="" width={36} height={36} />
            <span className="label">Shop admin</span>
          </Link>
          <div className="flex items-center">
            <a href={asset("/")} target="_blank" rel="noopener" className="label grid min-h-11 place-items-center px-2 text-muted">
              View shop
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-[760px] px-4">{children}</main>
        <nav
          aria-label="Admin"
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-fg bg-white pb-[env(safe-area-inset-bottom,0px)]"
        >
          {TABS.map((t) => {
            const href = t.href.replace(/\/$/, "");
            const on = href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/") || (href === "/admin/inventory" && path === "/admin/product");
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`relative grid h-[60px] place-items-center text-[11px] font-bold tracking-[0.08em] uppercase ${on ? "bg-fg text-white" : "text-fg"}`}
              >
                {t.label}
                {t.label === "Orders" && pending > 0 && (
                  <span className={`absolute top-2 right-[calc(50%-30px)] grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] ${on ? "bg-white text-fg" : "bg-fg text-white"}`}>
                    <span className="sr-only">, waiting: </span>
                    {pending}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-none fixed bottom-[calc(84px+env(safe-area-inset-bottom,0px))] left-1/2 z-90 max-w-[90vw] -translate-x-1/2 bg-fg px-4.5 py-3 text-center text-[13px] font-semibold text-white transition-all duration-300 ${message ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"}`}
        >
          {message}
        </div>
      </div>
    </AdminCtx.Provider>
  );
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset("logo.png")} alt="Loading…" width={72} height={72} className="animate-pulse" />
    </div>
  );
}
