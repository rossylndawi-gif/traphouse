/** Browser-side loading: Google Sheet first, products.yml backup if that fails. */

import { SHEET_CSV_URL, asset } from "./config";
import { describeProblem, rowsFromCSV, rowsFromYAML, toProducts, type Product } from "./products";

export type Loaded = { products: Product[]; source: "sheet" | "backup" | "none" };

async function fetchText(url: string, ms: number) {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fromSheet(): Promise<Product[]> {
  const { products, problems } = toProducts(rowsFromCSV(await fetchText(SHEET_CSV_URL, 10000)));
  problems.forEach((p) => console.warn(describeProblem(p, "Google Sheet")));
  if (!products.length) throw new Error("no usable rows");
  return products;
}

async function fromBackup(): Promise<Product[]> {
  const [{ load }, text] = await Promise.all([import("js-yaml"), fetchText(asset("products.yml"), 10000)]);
  const { products, problems } = toProducts(rowsFromYAML(load(text)));
  problems.forEach((p) => console.warn(describeProblem(p, "products.yml")));
  return products;
}

let pending: Promise<Loaded> | null = null;

/** Loads once per visit; every page shares the result. */
export function loadProducts(): Promise<Loaded> {
  pending ??= (async (): Promise<Loaded> => {
    try {
      return { products: await fromSheet(), source: "sheet" };
    } catch (e) {
      console.warn(`[products] Google Sheet could not be used (${(e as Error).message}); showing the backup products.yml`);
    }
    try {
      return { products: await fromBackup(), source: "backup" };
    } catch (e) {
      console.error(`[products] backup products.yml could not be loaded either (${(e as Error).message})`);
      return { products: [], source: "none" };
    }
  })();
  return pending;
}
