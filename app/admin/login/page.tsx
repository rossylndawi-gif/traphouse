"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FLASH_KEY } from "@/components/admin/AdminShell";
import { ErrorBox, Field, btn, input } from "@/components/admin/ui";
import { SHOP_NAME, asset } from "@/lib/config";
import { errorText, supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Log in — Shop admin";
    try {
      const flash = sessionStorage.getItem(FLASH_KEY);
      if (flash) {
        setError(flash);
        sessionStorage.removeItem(FLASH_KEY);
      }
    } catch {}
  }, []);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const { error } = await supabase().auth.signInWithPassword({
      email: String(f.get("email") ?? "").trim(),
      password: String(f.get("password") ?? ""),
    });
    // on success the admin shell checks the admins list and opens the dashboard
    if (error) {
      setError(/invalid login credentials/i.test(error.message) ? "Wrong email or password." : errorText(error));
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset("logo.png")} alt="" width={80} height={80} className="mb-4 self-center" />
      <h1 className="display text-center text-[30px]">Shop admin</h1>
      <p className="mt-1 text-center text-[13px] text-muted">{SHOP_NAME}</p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <form onSubmit={submit} className="mt-6 grid gap-4">
        <Field label="Email">
          <input name="email" type="email" autoComplete="username" inputMode="email" required className={input} />
        </Field>
        <Field label="Password">
          <input name="password" type="password" autoComplete="current-password" required className={input} />
        </Field>
        <button type="submit" disabled={busy} className={`${btn.dark} mt-2 w-full`}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <a href={asset("/")} className="label mt-8 grid min-h-11 place-items-center text-muted">
        ← Back to the shop
      </a>
    </main>
  );
}
