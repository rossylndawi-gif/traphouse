"use client";

/* Site frame: header, menu overlay, footer, toast (the cart is in Cart.tsx). */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type FormEvent } from "react";
import { ADDRESS, MAPS_URL, SHOP_NAME, WHATSAPP_DISPLAY, WHATSAPP_NUMBER, asset } from "@/lib/config";
import { slugify } from "@/lib/products";
import { BagIcon, CloseIcon, MenuIcon, PinIcon, SearchIcon, WhatsAppIcon } from "./icons";
import { useCart, useProducts, useUI } from "./Store";

export function Header() {
  const { panel, open, close } = useUI();
  const { count } = useCart();
  const menuOpen = panel === "menu";
  return (
    <header className="sticky top-0 z-40 grid h-[calc(72px+env(safe-area-inset-top,0px))] grid-cols-[48px_1fr_48px] items-center border-b border-fg bg-white/95 px-3 pt-[env(safe-area-inset-top,0px)] backdrop-blur sm:px-5">
      <button
        type="button"
        className="grid size-11 place-items-center"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        aria-controls="menu"
        onClick={() => (menuOpen ? close() : open("menu"))}
      >
        {menuOpen ? <CloseIcon /> : <MenuIcon />}
      </button>
      <Link href="/" onClick={close} className="block size-14 justify-self-center transition-transform duration-500 ease-out-expo hover:-rotate-8" aria-label={`${SHOP_NAME} — home`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset("logo.png")} alt={SHOP_NAME} width={56} height={56} />
      </Link>
      <button
        type="button"
        className="relative grid size-11 place-items-center justify-self-end"
        aria-label={count ? `Open cart, ${count} item${count === 1 ? "" : "s"}` : "Open cart"}
        aria-controls="cart"
        onClick={() => open("cart")}
      >
        <BagIcon />
        {count > 0 && (
          <span aria-hidden="true" className="absolute top-0.5 right-0 grid h-[19px] min-w-[19px] place-items-center rounded-full bg-fg px-1.5 text-[11px] font-bold text-white">
            {count}
          </span>
        )}
      </button>
    </header>
  );
}

export function useDialog(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<Element | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      last.current = document.activeElement;
      setTimeout(() => el.querySelector<HTMLElement>("[data-autofocus]")?.focus(), 60);
      const trap = (e: KeyboardEvent) => {
        if (e.key !== "Tab") return;
        const f = [...el.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])")].filter((x) => x.offsetParent);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) (f[f.length - 1].focus(), e.preventDefault());
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) (f[0].focus(), e.preventDefault());
      };
      el.addEventListener("keydown", trap);
      return () => el.removeEventListener("keydown", trap);
    } else if (last.current instanceof HTMLElement && el.contains(document.activeElement)) {
      last.current.focus({ preventScroll: true });
    }
  }, [open]);
  return ref;
}

export function Contact({ center }: { center?: boolean }) {
  return (
    <div className={`flex flex-col gap-2.5 text-sm ${center ? "items-center" : ""}`}>
      <a href={`https://wa.me/${WHATSAPP_NUMBER}`} target="_blank" rel="noopener" className="flex items-start gap-2.5 hover:underline">
        <WhatsAppIcon /> {WHATSAPP_DISPLAY}
      </a>
      <a href={MAPS_URL} target="_blank" rel="noopener" className={`flex max-w-80 items-start gap-2.5 hover:underline ${center ? "text-left" : ""}`}>
        <PinIcon /> {ADDRESS}
      </a>
    </div>
  );
}

export function MenuOverlay() {
  const { panel, close } = useUI();
  const { categories } = useProducts();
  const router = useRouter();
  const open = panel === "menu";
  const ref = useDialog(open);

  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
    close();
    router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
  };

  return (
    <div
      ref={ref}
      id="menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      inert={!open}
      className={`fixed inset-0 z-60 overflow-y-auto bg-white px-4 pt-[calc(12px+env(safe-area-inset-top,0px))] pb-10 transition-transform duration-[350ms] ease-out-expo sm:px-6 lg:w-[460px] lg:border-r lg:border-fg ${open ? "menu-open translate-x-0" : "-translate-x-full"}`}
    >
      <div className="-mr-2 flex items-center justify-between">
        <span className="label">Menu</span>
        <button type="button" onClick={close} aria-label="Close menu" className="grid size-11 place-items-center" data-autofocus>
          <CloseIcon />
        </button>
      </div>
      <form onSubmit={onSearch} role="search" className="mt-4 flex border border-fg">
        <label htmlFor="menu-q" className="sr-only">
          Search products
        </label>
        <input id="menu-q" name="q" type="search" placeholder="Search" autoComplete="off" enterKeyHint="search" className="min-w-0 flex-1 bg-white p-3.5 text-base outline-none" />
        <button type="submit" aria-label="Search" className="grid w-[54px] place-items-center bg-fg text-white">
          <SearchIcon />
        </button>
      </form>
      <nav aria-label="Categories" className="my-6 flex flex-col">
        {["All", ...categories].map((c, i) => (
          <Link
            key={c}
            href={c === "All" ? "/" : `/?category=${slugify(c)}`}
            onClick={close}
            className="menu-link display py-1.5 text-[34px] hover:underline hover:decoration-2 hover:underline-offset-4"
            style={{ "--i": i } as React.CSSProperties}
          >
            {c}
          </Link>
        ))}
      </nav>
      <Contact />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="flex flex-col items-center gap-2.5 border-t border-fg px-4 pt-10 pb-[calc(32px+env(safe-area-inset-bottom,0px))] text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={asset("logo.png")} alt="" width={72} height={72} loading="lazy" />
      <p className="display text-[22px]">{SHOP_NAME}</p>
      <Contact center />
      <p className="text-xs text-muted">© {new Date().getFullYear()} {SHOP_NAME} · Kigali</p>
    </footer>
  );
}

export function Toast() {
  const { message } = useUI();
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed bottom-[calc(24px+env(safe-area-inset-bottom,0px))] left-1/2 z-90 -translate-x-1/2 bg-fg px-4.5 py-3 text-[13px] font-semibold text-white transition-all duration-300 ${message ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"}`}
    >
      {message}
    </div>
  );
}
