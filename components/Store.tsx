"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_ORDER } from "@/lib/config";
import { loadProducts } from "@/lib/load";
import { categoriesOf, type Product } from "@/lib/products";

/* ── Products (live from the sheet) ───────────────────── */

type ProductsState = {
  status: "loading" | "ready";
  products: Product[];
  categories: string[];
  source: "sheet" | "backup" | "none" | null;
  get: (id: string) => Product | undefined;
};
const ProductsCtx = createContext<ProductsState | null>(null);

/* ── Cart (saved on the phone) ────────────────────────── */

export type CartLine = { id: string; color: string; qty: number };
type CartState = {
  lines: CartLine[];
  count: number;
  add: (id: string, color: string) => void;
  setQty: (index: number, qty: number) => void;
};
const CartCtx = createContext<CartState | null>(null);
const CART_KEY = "ths-cart";

/* ── Panels + toast ───────────────────────────────────── */

type Panel = "menu" | "cart" | null;
type UIState = { panel: Panel; open: (p: Exclude<Panel, null>) => void; close: () => void; toast: (msg: string) => void; message: string };
const UICtx = createContext<UIState | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  /* products */
  const [loaded, setLoaded] = useState<{ products: Product[]; source: ProductsState["source"] } | null>(null);
  useEffect(() => {
    let live = true;
    loadProducts().then((r) => live && setLoaded(r));
    return () => {
      live = false;
    };
  }, []);
  const products = useMemo(() => loaded?.products ?? [], [loaded]);
  const productsState = useMemo<ProductsState>(
    () => ({
      status: loaded ? "ready" : "loading",
      products,
      categories: categoriesOf(products, CATEGORY_ORDER),
      source: loaded?.source ?? null,
      get: (id) => products.find((p) => p.id === id),
    }),
    [loaded, products],
  );

  /* cart */
  const [lines, setLines] = useState<CartLine[]>([]);
  const hydrated = useRef(false);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      if (Array.isArray(raw)) setLines(raw.filter((l) => l && typeof l.id === "string" && l.qty > 0));
    } catch {
      /* storage unavailable */
    }
    hydrated.current = true;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== CART_KEY) return;
      try {
        setLines(JSON.parse(e.newValue || "[]"));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(lines));
    } catch {
      /* private mode: cart lasts for this visit */
    }
  }, [lines]);
  // Once live data is in, drop items that were removed or sold out
  useEffect(() => {
    if (!loaded || !loaded.products.length) return;
    setLines((ls) => {
      const kept = ls.filter((l) => {
        const p = loaded.products.find((x) => x.id === l.id);
        return p && !p.soldOut;
      });
      return kept.length === ls.length ? ls : kept;
    });
  }, [loaded]);

  const add = useCallback((id: string, color: string) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.id === id && l.color === color);
      return i >= 0 ? ls.map((l, k) => (k === i ? { ...l, qty: Math.min(l.qty + 1, 99) } : l)) : [...ls, { id, color, qty: 1 }];
    });
  }, []);
  const setQty = useCallback((index: number, qty: number) => {
    setLines((ls) => (qty <= 0 ? ls.filter((_, k) => k !== index) : ls.map((l, k) => (k === index ? { ...l, qty: Math.min(qty, 99) } : l))));
  }, []);
  const cartState = useMemo<CartState>(
    () => ({ lines, count: lines.reduce((n, l) => n + l.qty, 0), add, setQty }),
    [lines, add, setQty],
  );

  /* ui */
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((m: string) => {
    setMessage(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 2200);
  }, []);
  const ui = useMemo<UIState>(
    () => ({ panel, open: setPanel, close: () => setPanel(null), toast, message }),
    [panel, toast, message],
  );
  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", panel !== null);
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  return (
    <ProductsCtx.Provider value={productsState}>
      <CartCtx.Provider value={cartState}>
        <UICtx.Provider value={ui}>{children}</UICtx.Provider>
      </CartCtx.Provider>
    </ProductsCtx.Provider>
  );
}

const need = <T,>(v: T | null, name: string) => {
  if (!v) throw new Error(name + " used outside StoreProvider");
  return v;
};
export const useProducts = () => need(useContext(ProductsCtx), "useProducts");
export const useCart = () => need(useContext(CartCtx), "useCart");
export const useUI = () => need(useContext(UICtx), "useUI");
