// Checks the live Supabase project the way a shop visitor sees it:
// the shop functions work and private data stays private.
// Uses only the publishable key from .env.local. Creates nothing.
//
//   node scripts/check-supabase.mjs

import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* fall back to the environment (CI) */
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set");

const sb = createClient(url, key, { auth: { persistSession: false } });
let failed = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "✔" : "✖"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

const cat = await sb.rpc("shop_catalog");
check(!cat.error && Array.isArray(cat.data), "shop_catalog() works", cat.error?.message ?? `${cat.data.length} products`);

const po = await sb.rpc("place_order", { p_items: [], p_name: "Check", p_phone: "0788000000" });
check(po.data?.error === "empty", "place_order() is callable", po.error?.message ?? po.data?.error);

for (const table of ["orders", "order_items", "stock_movements", "admins", "inventory"]) {
  const r = await sb.from(table).select("*").limit(1);
  check(!!r.error || r.data.length === 0, `visitors can't read ${table}`, r.error?.code ?? "no rows visible");
}

const up = await sb.from("variants").update({ on_hand: 999 }).neq("on_hand", -1).select();
check(!!up.error || up.data.length === 0, "visitors can't change stock", up.error?.code ?? "");

const rs = await sb.rpc("restock", { p_variant_id: "00000000-0000-0000-0000-000000000000", p_qty: 1 });
check(!!rs.error, "visitors can't call admin functions", rs.error?.code ?? "");

const img = await sb.storage.from("products").upload(`check-${Date.now()}.txt`, "x", { contentType: "image/jpeg" });
check(!!img.error, "visitors can't upload photos", img.error?.message ?? "upload succeeded!");

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
