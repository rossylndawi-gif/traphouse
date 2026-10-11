// Runs before every build (npm run build → prebuild).
// Saves a copy of the Google Sheet as public/products.yml. The live site
// falls back to that copy if the sheet can't be reached, and the build uses
// it for product page titles and preview images.
// If the sheet can't be reached at build time either, the products.yml in
// the repo root is used instead.
//
//   node scripts/snapshot.mjs                 → writes public/products.yml
//   node scripts/snapshot.mjs products.yml    → refreshes the repo fallback

import fs from "node:fs";
import yaml from "js-yaml";

const SHEET =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_2TF_pMLV_dfSMFkT3zxjmROTHfStT3QTFT7TeUH3hKKJpIlGcsp07kextK5pkg/pub?gid=1915751725&single=true&output=csv";
const out = process.argv[2] || "public/products.yml";

function parseCSV(text) {
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') (f += '"'), i++;
        else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") row.push(f), (f = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f), rows.push(row), (row = []), (f = "");
    } else f += c;
  }
  if (f || row.length) row.push(f), rows.push(row);
  return rows.filter((r) => r.some((x) => x.trim()));
}

const list = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);

async function fromSheet() {
  const res = await fetch(SHEET, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const [head, ...rows] = parseCSV(await res.text());
  const col = (name) => head.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const idx = {
    name: col("Name"), category: col("Category"), price: col("Price (RWF)"), size: col("Size"),
    sold: col("Sold Out"), colours: col("Colours"), colourPhotos: col("Colour Photos"),
    main: col("Main Photo"), extra: col("Extra Photos"),
  };
  const missing = Object.entries(idx).filter(([, i]) => i < 0).map(([k]) => k);
  if (missing.length) throw new Error("sheet is missing columns: " + missing.join(", "));
  return rows.map((r) => {
    const g = (k) => (r[idx[k]] ?? "").trim();
    const p = {
      name: g("name"),
      category: g("category"),
      price: /^[\d,\s]+$/.test(g("price")) ? Number(g("price").replace(/\D/g, "")) : g("price"),
      size: g("size"),
      colors: list(g("colours")),
    };
    if (list(g("colourPhotos")).length) p.images = list(g("colourPhotos"));
    p.image = g("main");
    if (list(g("extra")).length) p.gallery = list(g("extra"));
    p.sold_out = /^yes$/i.test(g("sold"));
    if (g("sold") && !/^(yes|no)$/i.test(g("sold"))) p.sold_out = g("sold"); // keep bad value so the site skips + logs it
    return p;
  });
}

const header = `# ─────────────────────────────────────────────────────────────
#  BACKUP COPY of the product list.
#  The website reads products from the Google Sheet. This file is only
#  used if the sheet can't be reached, so you don't need to edit it.
#  It is refreshed automatically from the sheet every hour.
# ─────────────────────────────────────────────────────────────

`;

try {
  const products = await fromSheet();
  const body = products.map((p) => yaml.dump([p], { lineWidth: 200, flowLevel: 2 })).join("\n");
  fs.mkdirSync(out.includes("/") ? out.slice(0, out.lastIndexOf("/")) : ".", { recursive: true });
  fs.writeFileSync(out, header + body);
  console.log(`snapshot: ${products.length} products from the Google Sheet → ${out}`);
} catch (e) {
  if (out === "products.yml") throw e;
  console.warn(`snapshot: Google Sheet unavailable (${e.message}); using repo products.yml`);
  fs.copyFileSync("products.yml", out);
}
