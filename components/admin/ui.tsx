"use client";

/* Small building blocks for the admin, in the shop's black-and-white style. */

import { useEffect, useRef } from "react";
import { CloseIcon } from "../icons";

const BASE = "inline-flex min-h-12 items-center justify-center gap-2 px-4 text-[13px] font-bold tracking-widest uppercase transition active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40";
export const btn = {
  dark: `${BASE} bg-fg text-white hover:bg-[#2a2a2a]`,
  line: `${BASE} border border-fg bg-white hover:bg-soft`,
  danger: `${BASE} border border-alert bg-white text-alert hover:bg-[#fff5f5]`,
};
export const input =
  "min-h-12 w-full min-w-0 border border-fg bg-white px-3.5 text-base outline-none focus:border-2 focus:px-[13px] disabled:border-line disabled:text-muted";

export function PageHead({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mt-5 mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="display text-[30px]">{title}</h1>
        {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[13px] font-semibold">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="grid gap-2 py-6" aria-busy="true">
      <p className="sr-only">{label}</p>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="shimmer h-14" />
      ))}
    </div>
  );
}

export function ErrorBox({ children, onRetry }: { children: React.ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="my-3 border border-alert p-3 text-[14px] text-alert">
      <p className="font-semibold">{children}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 min-h-11 font-bold underline">
          Try again
        </button>
      )}
    </div>
  );
}

/** − n + control with big tap targets. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99999,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <div className="inline-flex items-center border border-fg" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Less ${label}`} className="size-12 text-lg disabled:text-line">
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Math.floor(Number(e.target.value));
          onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min);
        }}
        onFocus={(e) => e.target.select()}
        aria-label={label}
        className="h-12 w-14 border-x border-line text-center text-base tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`} className="size-12 text-lg disabled:text-line">
        +
      </button>
    </div>
  );
}

/** Panel that slides up from the bottom (phone) / centred box (desktop). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const last = document.activeElement as HTMLElement | null;
    setTimeout(() => ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus(), 50);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    document.body.classList.add("overflow-hidden");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("overflow-hidden");
      last?.focus?.({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-80 flex items-end justify-center sm:items-center">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[92dvh] w-full overflow-y-auto border-t border-fg bg-white px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom,0px))] sm:max-w-md sm:border"
      >
        <div className="-mr-2 mb-2 flex items-center justify-between gap-2">
          <h2 className="display text-[22px]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 shrink-0 place-items-center">
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Small "On hand / Reserved / …" figure. */
export function Figure({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="border border-line p-3">
      <p className="label text-[11px] text-muted">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? "text-[26px] font-extrabold" : "text-[20px] font-bold"}`}>{value}</p>
    </div>
  );
}
