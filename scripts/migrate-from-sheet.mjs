// One-time move from the Google Sheet to Supabase.
//
//   node scripts/migrate-from-sheet.mjs --dry-run   → shows what it would do
//   node scripts/migrate-from-sheet.mjs             → does it
//
// For each sheet row it creates a product (same link/slug as on the old site)
// and turns its Size into stock: one size row with 1 in stock (0 if Sold Out
// was YES). A product with several colours gets one row per colour, each with
// 1 in stock. Photos named in the sheet are uploaded from public/images to the
// "products" Storage bucket under the same file name.
//
// Safe to run again: products and photos that already exist are left alone
// (so stock you've changed in the admin is never overwritten).
//
// Needs SUPABASE_SECRET_KEY in .env.local. The key is never printed.

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const SHEET =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_2TF_pMLV_dfSMFkT3zxjmROTHfStT3QTFT7TeUH3hKKJpIlGcsp07kextK5pkg/pub?gid=1915751725&single=true&output=csv";
const IMAGES = "public/images";
const dry = process.argv.includes("--dry-run");

try {
  process.loadEnvFile(".env.local");
} catch {
  /* use the environment */
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(1);
}
const sb = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

/* ── Read the sheet (same rules as the old site) ──────── */

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
  return rows;
}

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
const PHOTO = /^[^\s/\\]+\.(jpe?g|png|webp)$/i;

async function readSheet() {
  const res = await fetch(SHEET, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Google Sheet: HTTP ${res.status}`);
  const [head, ...rows] = parseCSV((await res.text()).replace(/^﻿/, ""));
  const col = (name) => head.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const cols = ["Name", "Category", "Price (RWF)", "Size", "Sold Out", "Colours", "Colour Photos", "Main Photo", "Extra Photos"];
  const missing = cols.filter((c) => col(c) < 0);
  if (missing.length) throw new Error(`Sheet is missing column(s): ${missing.join(", ")}`);

  const products = [];
  const problems = [];
  const seen = new Map();
  rows.forEach((r, i) => {
    if (!r.some((x) => x.trim())) return;
    const row = i + 2;
    const g = (c) => (r[col(c)] ?? "").trim();
    const bad = (m) => problems.push(`row ${row} (${g("Name") || "no name"}): ${m}`);

    const name = g("Name");
    const category = g("Category");
    const priceText = g("Price (RWF)").replace(/\s*(rwf|frw)\s*/gi, "");
    const sold = g("Sold Out").toUpperCase();
    const colours = list(g("Colours"));
    const colourPhotos = list(g("Colour Photos"));
    const extra = list(g("Extra Photos"));
    const main = g("Main Photo") || colourPhotos[0] || "";

    let price = null;
    if (priceText) {
      if (/^\d{1,3}(,\d{3})+$|^\d+$/.test(priceText)) price = Number(priceText.replace(/,/g, ""));
      else return bad(`price "${g("Price (RWF)")}" is not a number`);
    }
    if (!name) return bad("Name is empty");
    if (!category) return bad("Category is empty");
    if (sold && sold !== "YES" && sold !== "NO") return bad(`Sold Out is "${g("Sold Out")}"`);
    if (colourPhotos.length && colourPhotos.length !== colours.length)
      return bad(`${colourPhotos.length} colour photo(s) for ${colours.length} colour(s)`);
    if (!main) return bad("Main Photo is empty");
    const photos = [main, ...colourPhotos, ...extra];
    const notPhoto = photos.find((f) => !PHOTO.test(f));
    if (notPhoto) return bad(`"${notPhoto}" is not a photo file name`);

    // same slug as the old site, so links people shared keep working
    let slug = slugify(name) || "item";
    const n = (seen.get(slug) ?? 0) + 1;
    seen.set(slug, n);
    if (n > 1) slug += "-" + n;

    const size = g("Size") || "One Size";
    const onHand = sold === "YES" ? 0 : 1;
    const variants =
      colours.length > 1
        ? colours.map((c, k) => ({ size, colour: c, on_hand: onHand, position: k + 1 }))
        : [{ size, colour: "", on_hand: onHand, position: 1 }];

    products.push({
      row,
      slug,
      name,
      category,
      price_rwf: price,
      colours,
      colour_photos: colourPhotos,
      main_photo: main,
      extra_photos: extra,
      variants,
      photos: [...new Set(photos)],
    });
  });
  return { products, problems };
}

/* ── Upload photos ────────────────────────────────────── */

const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

async function existingPhotos() {
  const names = new Set();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from("products").list("", { limit: 1000, offset });
    if (error) throw new Error(`Storage: ${error.message}`);
    data.forEach((f) => names.add(f.name));
    if (data.length < 1000) return names;
  }
}

async function uploadPhoto(file) {
  const body = fs.readFileSync(path.join(IMAGES, file));
  const { error } = await sb.storage.from("products").upload(file, body, {
    contentType: TYPES[path.extname(file).toLowerCase()],
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(`upload ${file}: ${error.message}`);
}

/* ── Run ──────────────────────────────────────────────── */

const { products, problems } = await readSheet();
console.log(`Sheet: ${products.length} products${problems.length ? `, ${problems.length} row(s) skipped` : ""}`);
problems.forEach((p) => console.warn(`  skipped ${p}`));

const { data: admins, error: adminErr } = await sb.from("admins").select("user_id");
if (adminErr) throw new Error(`Supabase: ${adminErr.message}`);
if (!admins.length) console.warn("Note: no admin user yet (see README). The migration still runs.");

const { data: existing, error: exErr } = await sb.from("products").select("slug");
if (exErr) throw new Error(`Supabase: ${exErr.message}`);
const have = new Set(existing.map((p) => p.slug));

const stored = await existingPhotos();
const allPhotos = [...new Set(products.flatMap((p) => p.photos))];
const missingFiles = allPhotos.filter((f) => !fs.existsSync(path.join(IMAGES, f)));
const toUpload = allPhotos.filter((f) => !stored.has(f) && !missingFiles.includes(f));
missingFiles.forEach((f) => console.warn(`  photo not in ${IMAGES}: ${f} (the product will show a grey box until you add it)`));

const toCreate = products.filter((p) => !have.has(p.slug));
console.log(`Photos: ${toUpload.length} to upload, ${allPhotos.length - toUpload.length - missingFiles.length} already in Storage`);
console.log(`Products: ${toCreate.length} to create, ${products.length - toCreate.length} already in Supabase`);

if (dry) {
  for (const p of toCreate)
    console.log(
      `  + ${p.name} [${p.slug}] ${p.price_rwf ?? "on request"} — ` +
        p.variants.map((v) => `${v.size}${v.colour ? " " + v.colour : ""}: ${v.on_hand}`).join(", "),
    );
  console.log("\nDry run: nothing was changed.");
  process.exit(0);
}

let uploaded = 0;
for (const f of toUpload) {
  await uploadPhoto(f);
  uploaded++;
  process.stdout.write(`\r  uploaded ${uploaded}/${toUpload.length}`);
}
if (toUpload.length) process.stdout.write("\n");

// first sheet row = newest, so the shop keeps the sheet's order
const now = Date.now();
let created = 0;
for (const [i, p] of products.entries()) {
  if (have.has(p.slug)) continue;
  const { data: prod, error } = await sb
    .from("products")
    .insert({
      slug: p.slug,
      name: p.name,
      category: p.category,
      price_rwf: p.price_rwf,
      colours: p.colours,
      colour_photos: p.colour_photos,
      main_photo: p.main_photo,
      extra_photos: p.extra_photos,
      created_at: new Date(now - i * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(`${p.name}: ${error.message}`);

  const { data: vars, error: vErr } = await sb
    .from("variants")
    .insert(p.variants.map((v) => ({ ...v, product_id: prod.id })))
    .select("id, on_hand");
  if (vErr) throw new Error(`${p.name} sizes: ${vErr.message}`);

  const moves = vars.filter((v) => v.on_hand > 0).map((v) => ({ variant_id: v.id, change: v.on_hand, reason: "adjustment", note: "imported from Google Sheet" }));
  if (moves.length) {
    const { error: mErr } = await sb.from("stock_movements").insert(moves);
    if (mErr) throw new Error(`${p.name} stock log: ${mErr.message}`);
  }
  created++;
}

console.log(`Done: ${created} products created, ${uploaded} photos uploaded.`);
