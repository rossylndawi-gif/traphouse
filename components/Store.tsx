"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_ORDER, MAX_PER_ITEM, MAX_PER_ORDER } from "@/lib/config";
import { loadProducts, type Loaded } from "@/lib/load";
import { categoriesOf, type Product, type Variant } from "@/lib/products";

/* ── Products (live from Supabase) ────────────────────── */

type ProductsState = {
  status: "loading" | "ready";
  products: Product[];
  categories: string[];
  source: Loaded["source"] | null;
  get: (id: string) => Product | undefined;
  /** Load again, e.g. after something sold out while the page was open. */
  refresh: () => Promise<void>;
};
const ProductsCtx = createContext<ProductsState | null>(null);

/* ── Cart + customer details (saved on the phone) ─────── */

export type CartLine = { id: string; variant: string; color: string; qty: number };
export type Customer = { name: string; phone: string };
type CartState = {
  lines: CartLine[];
  count: number;
  /** Returns an error message if the limit or the stock is reached. */
  add: (id: string, variant: string, color: string) => string | null;
  setQty: (index: number, qty: number) => string | null;
  clear: () => void;
  customer: Customer;
  setCustomer: (c: Customer) => void;
};
const CartCtx = createContext<CartState | null>(null);
const CART_KEY = "ths-cart-v2";
const CUSTOMER_KEY = "ths-customer";

const read = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: lasts for this visit */
  }
};
const validLines = (raw: unknown): CartLine[] =>
  Array.isArray(raw)
    ? raw.filter((l) => l && typeof l.id === "string" && typeof l.variant === "string" && typeof l.color === "string" && l.qty > 0)
    : [];

/* ── Panels + toast ───────────────────────────────────── */

type Panel = "menu" | "cart" | null;
type UIState = { panel: Panel; open: (p: Exclude<Panel, null>) => void; close: () => void; toast: (msg: string) => void; message: string };
const UICtx = createContext<UIState | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  /* products */
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let live = true;
    loadProducts().then((r) => live && setLoaded(r));
    return () => {
      live = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    const r = await loadProducts(true);
    if (r.source !== "none") setLoaded(r);
  }, []);
  const products = useMemo(() => loaded?.products ?? [], [loaded]);
  const productsState = useMemo<ProductsState>(
    () => ({
      status: loaded ? "ready" : "loading",
      products,
      categories: categoriesOf(products, CATEGORY_ORDER),
      source: loaded?.source ?? null,
      get: (id) => products.find((p) => p.id === id),
      refresh,
    }),
    [loaded, products, refresh],
  );

  /* cart */
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomerState] = useState<Customer>({ name: "", phone: "" });
  const hydrated = useRef(false);
  useEffect(() => {
    setLines(validLines(read(CART_KEY, [])));
    const c = read<Partial<Customer>>(CUSTOMER_KEY, {});
    setCustomerState({ name: String(c.name ?? ""), phone: String(c.phone ?? "") });
    hydrated.current = true;
    const onStorage = (e: StorageEvent) => {
      if (e.key === CART_KEY) setLines(validLines(read(CART_KEY, [])));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    if (hydrated.current) write(CART_KEY, lines);
  }, [lines]);
  const setCustomer = useCallback((c: Customer) => {
    setCustomerState(c);
    write(CUSTOMER_KEY, c);
  }, []);

  // Once live data is in, drop sizes that no longer exist (sold-out ones stay, flagged in the cart)
  useEffect(() => {
    if (!loaded || loaded.source === "none") return;
    setLines((ls) => {
      const kept = ls.filter((l) => loaded.products.some((p) => p.id === l.id && p.variants.some((v) => v.id === l.variant)));
      return kept.length === ls.length ? ls : kept;
    });
  }, [loaded]);

  const findVariant = useCallback(
    (id: string, variant: string): Variant | undefined => products.find((p) => p.id === id)?.variants.find((v) => v.id === variant),
    [products],
  );

  /** Why `line` (at `index` in `ls`) can't have its qty, or null if it can. */
  const overLimit = useCallback(
    (ls: CartLine[], index: number, line: CartLine) => {
      const others = ls.reduce((n, l, k) => (k === index ? n : n + l.qty), 0);
      const sameSize = ls.reduce((n, l, k) => (k !== index && l.variant === line.variant ? n + l.qty : n), 0);
      const stock = (findVariant(line.id, line.variant)?.available ?? Infinity) - sameSize;
      if (line.qty > stock) return stock > 0 ? `Only ${stock + sameSize} left in this size` : "This size is sold out";
      if (line.qty > MAX_PER_ITEM) return `You can order up to ${MAX_PER_ITEM} of the same item`;
      if (others + line.qty > MAX_PER_ORDER) return `You can order up to ${MAX_PER_ORDER} items at a time`;
      return null;
    },
    [findVariant],
  );

  // add/setQty read the latest lines without re-creating the callbacks
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  const commit = useCallback((ls: CartLine[]) => {
    linesRef.current = ls;
    setLines(ls);
  }, []);

  const add = useCallback(
    (id: string, variant: string, color: string) => {
      const ls = linesRef.current;
      const i = ls.findIndex((l) => l.variant === variant && l.color === color);
      const line = i >= 0 ? { ...ls[i], qty: ls[i].qty + 1 } : { id, variant, color, qty: 1 };
      const why = overLimit(ls, i >= 0 ? i : ls.length, line);
      if (why) return why;
      commit(i >= 0 ? ls.map((l, k) => (k === i ? line : l)) : [...ls, line]);
      return null;
    },
    [overLimit, commit],
  );
  const setQty = useCallback(
    (index: number, qty: number) => {
      const ls = linesRef.current;
      if (qty <= 0) {
        commit(ls.filter((_, k) => k !== index));
        return null;
      }
      const line = { ...ls[index], qty };
      // lowering is always allowed, even when the line is over a limit
      const why = qty > ls[index].qty ? overLimit(ls, index, line) : null;
      if (why) return why;
      commit(ls.map((l, k) => (k === index ? line : l)));
      return null;
    },
    [overLimit, commit],
  );
  const clear = useCallback(() => commit([]), [commit]);
  const cartState = useMemo<CartState>(
    () => ({ lines, count: lines.reduce((n, l) => n + l.qty, 0), add, setQty, clear, customer, setCustomer }),
    [lines, add, setQty, clear, customer, setCustomer],
  );

  /* ui */
  const [panel, setPanel] = useState<Panel>(null);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((m: string) => {
    setMessage(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 2600);
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
