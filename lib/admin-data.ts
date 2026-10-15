/** Admin-side data shapes and the queries several admin pages share. */

import { formatRWF } from "./products";
import { supabase } from "./supabase";

/** One size/colour of a product, from the `inventory` view. */
export type InventoryRow = {
  variant_id: string;
  product_id: string;
  slug: string;
  name: string;
  category: string;
  price_rwf: number | null;
  main_photo: string;
  product_active: boolean;
  size: string;
  colour: string;
  position: number;
  active: boolean;
  on_hand: number;
  reserved: number;
  available: number;
  sold: number;
};

export type Period = { items: number; revenue: number };
export type Stats = {
  in_stock: number;
  reserved: number;
  pending: number;
  expired: number;
  today: Period;
  week: Period;
  month: Period;
  low_stock: Pick<InventoryRow, "variant_id" | "product_id" | "name" | "size" | "colour" | "on_hand" | "reserved" | "available">[];
};

export async function fetchInventory(): Promise<InventoryRow[]> {
  const { data, error } = await supabase()
    .from("inventory")
    .select("*")
    .eq("active", true)
    .order("name")
    .order("position");
  if (error) throw error;
  return data as InventoryRow[];
}

/** Calls a database function and throws its error message. */
export async function call<T>(fn: string, args: object = {}): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const rwf = (n: number | null | undefined) => (n == null ? "On request" : formatRWF(n));

/** "Size M · red" */
export const sizeLabel = (r: { size: string; colour: string }) =>
  [r.size && `Size ${r.size}`, r.colour].filter(Boolean).join(" · ");

/** "5 h 12 min left" / "expired" */
export function timeLeft(expires: string | null, now = Date.now()) {
  if (!expires) return "";
  const ms = new Date(expires).getTime() - now;
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h ? `${h} h ${m} min left` : `${m} min left`;
}

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kigali" });
