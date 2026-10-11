/**
 * Build-time product list (titles, preview images and the list of product
 * pages). Reads public/products.yml, which scripts/snapshot.mjs saves from the
 * Google Sheet just before each build.
 */
import fs from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { describeProblem, rowsFromYAML, toProducts, type Product } from "./products";

let cache: Product[] | null = null;

export function buildProducts(): Product[] {
  if (cache) return cache;
  const file = ["public/products.yml", "products.yml"]
    .map((f) => path.join(process.cwd(), f))
    .find((f) => fs.existsSync(f));
  if (!file) return (cache = []);
  const { products, problems } = toProducts(rowsFromYAML(load(fs.readFileSync(file, "utf8"))));
  problems.forEach((p) => console.warn(describeProblem(p, path.basename(file))));
  return (cache = products);
}
