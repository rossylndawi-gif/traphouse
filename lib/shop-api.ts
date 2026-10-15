/**
 * The two database calls the shop makes, with the publishable key.
 * Plain fetch (no client library) keeps the shop's JavaScript small.
 */

import { SUPABASE_KEY, SUPABASE_URL } from "./config";

async function rpc<T>(fn: string, args: object, ms: number): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY)");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(`${fn}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export const fetchCatalog = () => rpc<unknown>("shop_catalog", {}, 10000);

export type Unavailable = { variant_id: string; product: string; size: string; colour: string; requested: number; available: number };
export type PlaceOrderResult =
  | { code: string; total_rwf: number; expires_at: string; error?: undefined }
  | { error: "name" | "phone" | "empty" | "invalid" | "limit" | "too_many" | "unavailable"; message: string; unavailable?: Unavailable[] };

export const placeOrder = (items: { variant_id: string; qty: number; colour: string }[], name: string, phone: string) =>
  rpc<PlaceOrderResult>("place_order", { p_items: items, p_name: name, p_phone: phone }, 15000);
