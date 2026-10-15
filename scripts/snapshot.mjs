// Runs before every build (npm run build → prebuild).
// Saves the shop catalogue from Supabase as public/products.yml. The live site
// falls back to that copy if Supabase can't be reached, and the build uses it
// for product page titles and preview images.
// If Supabase can't be reached at build time either, the products.yml in the
// repo root is used instead.
//
//   node scripts/snapshot.mjs                 → writes public/products.yml
//   node scripts/snapshot.mjs products.yml    → refreshes the repo fallback

import fs from "node:fs";
import yaml from "js-yaml";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: the variables come from GitHub secrets */
}
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const out = process.argv[2] || "public/products.yml";

async function fromSupabase() {
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY not set");
  const res = await fetch(`${url}/rest/v1/rpc/shop_catalog`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const products = await res.json();
  if (!Array.isArray(products)) throw new Error("unexpected response");
  // fixed key order keeps the file readable and the diffs small
  return products.map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    price_rwf: p.price_rwf,
    colours: p.colours,
    ...(p.colour_photos?.length ? { colour_photos: p.colour_photos } : {}),
    main_photo: p.main_photo,
    ...(p.extra_photos?.length ? { extra_photos: p.extra_photos } : {}),
    variants: p.variants.map((v) => ({ id: v.id, size: v.size, colour: v.colour, available: v.available })),
  }));
}

const header = `# ─────────────────────────────────────────────────────────────
#  BACKUP COPY of the product list.
#  The website reads products from Supabase (the admin at /admin).
#  This file is only used if Supabase can't be reached, so you don't
#  need to edit it. It is refreshed automatically every hour.
# ─────────────────────────────────────────────────────────────

`;

try {
  const products = await fromSupabase();
  const body = products.map((p) => yaml.dump([p], { lineWidth: 200, flowLevel: 3 })).join("\n");
  fs.mkdirSync(out.includes("/") ? out.slice(0, out.lastIndexOf("/")) : ".", { recursive: true });
  fs.writeFileSync(out, header + body);
  console.log(`snapshot: ${products.length} products from Supabase → ${out}`);
} catch (e) {
  if (out === "products.yml") throw e;
  console.warn(`snapshot: Supabase unavailable (${e.message}); using repo products.yml`);
  fs.copyFileSync("products.yml", out);
}
