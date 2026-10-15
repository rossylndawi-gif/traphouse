/** Browser-side loading: Supabase first, products.yml backup if that fails. */

import { asset } from "./config";
import { fromCatalog, type Product } from "./products";
import { fetchCatalog } from "./shop-api";

export type Loaded = { products: Product[]; source: "live" | "backup" | "none" };

async function fromBackup(): Promise<Product[]> {
  const [{ load }, res] = await Promise.all([
    import("js-yaml"),
    fetch(asset("products.yml"), { cache: "no-store", signal: AbortSignal.timeout(10000) }),
  ]);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return fromCatalog(load(await res.text()));
}

async function loadOnce(): Promise<Loaded> {
  try {
    const products = fromCatalog(await fetchCatalog());
    if (!products.length) console.warn("[products] the shop has no active products");
    return { products, source: "live" };
  } catch (e) {
    console.warn(`[products] Supabase could not be reached (${(e as Error).message}); showing the backup products.yml`);
  }
  try {
    return { products: await fromBackup(), source: "backup" };
  } catch (e) {
    console.error(`[products] backup products.yml could not be loaded either (${(e as Error).message})`);
    return { products: [], source: "none" };
  }
}

let pending: Promise<Loaded> | null = null;

/** Loads once per visit (every page shares the result); fresh = load again, e.g. after something sold out. */
export function loadProducts(fresh = false): Promise<Loaded> {
  if (fresh || !pending) pending = loadOnce();
  return pending;
}
