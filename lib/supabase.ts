/** Supabase client for the admin (login, data, photo uploads). The shop itself uses lib/shop-api.ts. */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "ths-admin-auth" },
  });
  return client;
}

/** Turns a Supabase/Postgres error into a sentence for the shop owner. */
export function errorText(e: unknown): string {
  const m = (e as { message?: string } | null)?.message ?? String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "No connection. Check your internet and try again.";
  if (/JWT|session|refresh token/i.test(m)) return "Your login has expired. Please log in again.";
  return m;
}
