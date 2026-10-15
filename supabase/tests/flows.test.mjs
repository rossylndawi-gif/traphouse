// Runs the migrations in an in-memory Postgres (PGlite) and checks the stock
// flows and permissions end to end, as a visitor, a logged-in non-admin and
// an admin.   npm run test:db
//
// PGlite has a single connection, so row locking under real concurrency isn't
// exercised here; everything else is.

import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const db = new PGlite();

const ADMIN = "00000000-0000-4000-8000-00000000000a";
const STRANGER = "00000000-0000-4000-8000-00000000000b";

/** Runs one query as "anon", a user id (logged in) or "postgres" (SQL Editor). */
async function as(who, sql, params = []) {
  if (who !== "postgres") {
    const claims = who === "anon" ? { role: "anon" } : { sub: who, role: "authenticated" };
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
    await db.exec(`set role ${who === "anon" ? "anon" : "authenticated"}`);
  }
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}

/** supabase.rpc(fn, args) equivalent. */
async function rpc(who, fn, args = {}) {
  const keys = Object.keys(args);
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
  const vals = keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
  return (await as(who, sql, vals))[0].r;
}

const rejects = (p, re) => assert.rejects(p, (e) => (re.test(e.message) ? true : assert.fail(`unexpected error: ${e.message}`)));

const catalog = () => rpc("anon", "shop_catalog");
const stockOf = async (variantId) => (await as("postgres", "select * from public.inventory where variant_id = $1", [variantId]))[0];
const variantOf = (product, size, colour = "") => product.variants.find((v) => v.size === size && v.colour === colour);
const order = (items, phone = "0788000001", name = "Test Customer") =>
  rpc("anon", "place_order", { p_items: items, p_name: name, p_phone: phone });

let tee; // product with sizes M (2) and L (1), any colour
let shirt; // product stocked per colour

before(async () => {
  await db.exec(fs.readFileSync(path.join(root, "tests/supabase-stub.sql"), "utf8"));
  const dir = path.join(root, "migrations");
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  }
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN}', 'owner@example.com'), ('${STRANGER}', 'someone@example.com');
    insert into public.admins (user_id) values ('${ADMIN}');
  `);
});
after(() => db.close());

/* ── Admin creates products ─────────────────────────────── */

test("admin creates a product with sizes; initial stock is logged", async () => {
  const r = await rpc(ADMIN, "save_product", {
    p: {
      name: "Hellstar Logo Tee",
      category: "T-Shirts",
      price_rwf: 25000,
      colours: ["white"],
      main_photo: "hellstar-logo-tee/front.jpg",
      variants: [
        { size: "M", on_hand: 2 },
        { size: "L", on_hand: 1 },
      ],
    },
  });
  assert.equal(r.slug, "hellstar-logo-tee");
  const moves = await as("postgres", "select reason, change, note from public.stock_movements order by id");
  assert.deepEqual(moves, [
    { reason: "adjustment", change: 2, note: "new size" },
    { reason: "adjustment", change: 1, note: "new size" },
  ]);

  await rpc(ADMIN, "save_product", {
    p: {
      name: "Cropped Button-Up Shirt",
      category: "Shirts",
      price_rwf: 20000,
      colours: ["blue plaid", "pink"],
      colour_photos: ["shirt/blue.jpg", "shirt/pink.jpg"],
      main_photo: "shirt/blue.jpg",
      variants: [
        { size: "M", colour: "blue plaid", on_hand: 1 },
        { size: "M", colour: "pink", on_hand: 0 },
      ],
    },
  });
  const same = await rpc(ADMIN, "save_product", {
    p: { name: "Hellstar Logo Tee", category: "T-Shirts", main_photo: "x.jpg", variants: [{ size: "S", on_hand: 0 }] },
  });
  assert.equal(same.slug, "hellstar-logo-tee-2", "a second product with the same name gets its own link");
  await as("postgres", "update public.products set active = false where slug = 'hellstar-logo-tee-2'");

  const cat = await catalog();
  tee = cat.find((p) => p.slug === "hellstar-logo-tee");
  shirt = cat.find((p) => p.slug === "cropped-button-up-shirt");
  assert.ok(tee && shirt);
  assert.equal(cat.length, 2, "hidden products are not in the shop");
  assert.deepEqual(tee.variants.map((v) => [v.size, v.available]), [["M", 2], ["L", 1]]);
  assert.equal(variantOf(shirt, "M", "pink").available, 0);
  assert.equal("on_hand" in tee.variants[0], false, "the shop never sees on_hand");
  assert.ok(Date.now() - new Date(tee.created_at).getTime() < 60_000, "the catalogue says when a product was added (NEW badge)");
});

test("save_product rejects bad input", async () => {
  const base = { name: "X", category: "Tanks", variants: [{ size: "M", on_hand: 1 }] };
  await rejects(rpc(ADMIN, "save_product", { p: { ...base, name: " " } }), /product name/);
  await rejects(rpc(ADMIN, "save_product", { p: { ...base, price_rwf: "20k" } }), /whole number/);
  await rejects(rpc(ADMIN, "save_product", { p: { ...base, variants: [] } }), /at least one size/);
  await rejects(rpc(ADMIN, "save_product", { p: { ...base, variants: [{ size: "M", on_hand: -1 }] } }), /0 or more/);
  await rejects(
    rpc(ADMIN, "save_product", { p: { ...base, variants: [{ size: "M", on_hand: 1 }, { size: "M", on_hand: 2 }] } }),
    /listed twice/,
  );
  await rejects(rpc(ADMIN, "save_product", { p: { ...base, variants: [{ size: "M", colour: "red", on_hand: 1 }] } }), /colour list/);
  await rejects(rpc(STRANGER, "save_product", { p: base }), /Only shop admins/);
});

/* ── Permissions ────────────────────────────────────────── */

test("visitors can only read the shop and place orders", async () => {
  await rejects(as("anon", "select * from public.orders"), /permission denied/);
  await rejects(as("anon", "select * from public.stock_movements"), /permission denied/);
  await rejects(as("anon", "select * from public.inventory"), /permission denied/);
  await rejects(as("anon", "update public.variants set on_hand = 99"), /permission denied/);
  await rejects(as("anon", "update public.products set price_rwf = 1"), /permission denied/);
  await rejects(as("anon", "insert into public.orders (status) values ('confirmed')"), /permission denied/);
  await rejects(rpc("anon", "restock", { p_variant_id: variantOf(tee, "M").id, p_qty: 5 }), /permission denied/);
  await rejects(rpc("anon", "confirm_order", { p_order_id: ADMIN }), /permission denied/);
  await rejects(rpc("anon", "reserved_qty", { p_variant_id: variantOf(tee, "M").id }), /permission denied/);
  await rejects(as("anon", "insert into storage.objects (bucket_id, name) values ('products', 'x.jpg')"), /row-level security/);

  const products = await as("anon", "select slug from public.products order by slug");
  assert.deepEqual(products.map((p) => p.slug), ["cropped-button-up-shirt", "hellstar-logo-tee"]);
});

test("a logged-in non-admin gets nothing extra", async () => {
  assert.deepEqual(await as(STRANGER, "select * from public.orders"), []);
  assert.deepEqual(await as(STRANGER, "select * from public.inventory where not product_active"), []);
  assert.equal(await rpc(STRANGER, "is_admin"), false);
  await rejects(rpc(STRANGER, "restock", { p_variant_id: variantOf(tee, "M").id, p_qty: 5 }), /Only shop admins/);
  await rejects(rpc(STRANGER, "admin_stats"), /Only shop admins/);
  const n = await as(STRANGER, "update public.products set price_rwf = 1 returning id");
  assert.equal(n.length, 0, "RLS blocks the update");
  await rejects(as(STRANGER, "insert into storage.objects (bucket_id, name) values ('products', 'x.jpg')"), /row-level security/);
});

test("admins can edit product details directly, but never stock", async () => {
  assert.equal(await rpc(ADMIN, "is_admin"), true);
  const r = await as(ADMIN, "update public.products set price_rwf = 25000 where id = $1 returning id", [tee.id]);
  assert.equal(r.length, 1);
  await rejects(as(ADMIN, "update public.variants set on_hand = 99"), /permission denied/);
  await rejects(as(ADMIN, "insert into public.stock_movements (variant_id, change, reason) values ($1, 1, 'restock')", [variantOf(tee, "M").id]), /permission denied/);
  await rejects(as(ADMIN, "delete from public.orders"), /permission denied/);
  await as(ADMIN, "insert into storage.objects (bucket_id, name) values ('products', 'ok.jpg')");
});

/* ── place_order checks ─────────────────────────────────── */

test("place_order validates the customer and the cart", async () => {
  const M = variantOf(tee, "M").id;
  assert.equal((await order([{ variant_id: M, qty: 1 }], "0788000001", "  ")).error, "name");
  assert.equal((await order([{ variant_id: M, qty: 1 }], "12")).error, "phone");
  assert.equal((await order([])).error, "empty");
  assert.equal((await order([{ variant_id: "nope", qty: 1 }])).error, "invalid");
  assert.equal((await order([{ variant_id: M, qty: 1.5 }])).error, "invalid");
  assert.equal((await order([{ variant_id: M, qty: 0 }])).error, "invalid");
  assert.equal((await order([{ variant_id: M, qty: 6 }])).error, "limit");
  assert.equal((await order([{ variant_id: M, qty: 3 }, { variant_id: M, qty: 3 }])).error, "limit", "same item split over lines");
  const many = Array.from({ length: 4 }, () => ({ variant_id: crypto.randomUUID(), qty: 4 }));
  assert.equal((await order(many)).error, "limit", "16 items in total");
  const r = await order([{ variant_id: crypto.randomUUID(), qty: 1 }]);
  assert.equal(r.error, "unavailable", "unknown size is reported as unavailable");
  assert.equal(await as("postgres", "select count(*)::int as n from public.orders").then((x) => x[0].n), 0, "nothing was reserved");
});

/* ── Reserve → confirm ──────────────────────────────────── */

test("reserve → confirm: the reservation becomes a sale", async () => {
  const M = variantOf(tee, "M").id;
  const r = await order([{ variant_id: M, qty: 2, colour: "white" }], "+250 788 000 001");
  assert.match(r.code, /^TH-\d{4}$/);
  assert.equal(r.code, "TH-1001");
  assert.equal(r.total_rwf, 50000);

  let s = await stockOf(M);
  assert.deepEqual([s.on_hand, s.reserved, s.available, s.sold], [2, 2, 0, 0]);
  assert.equal(variantOf(await catalog().then((c) => c.find((p) => p.id === tee.id)), "M").available, 0);

  const late = await order([{ variant_id: M, qty: 1 }], "0788000002");
  assert.equal(late.error, "unavailable");
  assert.deepEqual(late.unavailable.map((u) => [u.product, u.size, u.available]), [["Hellstar Logo Tee", "M", 0]]);

  const [o] = await as(ADMIN, "select * from public.orders where code = $1", [r.code]);
  assert.equal(o.customer_phone, "250788000001", "phone is stored in one format");
  const [item] = await as(ADMIN, "select * from public.order_items where order_id = $1", [o.id]);
  assert.deepEqual([item.product_name, item.size, item.colour, item.qty, item.unit_price], ["Hellstar Logo Tee", "M", "white", 2, 25000]);

  await rejects(rpc(STRANGER, "confirm_order", { p_order_id: o.id }), /Only shop admins/);
  assert.equal((await rpc(ADMIN, "confirm_order", { p_order_id: o.id })).status, "confirmed");
  await rejects(rpc(ADMIN, "confirm_order", { p_order_id: o.id }), /already confirmed/);

  s = await stockOf(M);
  assert.deepEqual([s.on_hand, s.reserved, s.available, s.sold], [0, 0, 0, 2]);
  const moves = await as(ADMIN, "select change, reason, order_id, admin_id from public.stock_movements where order_id = $1", [o.id]);
  assert.deepEqual(moves, [{ change: -2, reason: "sale", order_id: o.id, admin_id: ADMIN }]);
});

/* ── Reserve → cancel ───────────────────────────────────── */

test("reserve → cancel: the stock is free again, on_hand never moved", async () => {
  const L = variantOf(tee, "L").id;
  const r = await order([{ variant_id: L, qty: 1 }], "0788000003");
  assert.equal((await stockOf(L)).available, 0);

  const [o] = await as(ADMIN, "select id from public.orders where code = $1", [r.code]);
  assert.equal((await rpc(ADMIN, "cancel_order", { p_order_id: o.id })).status, "cancelled");
  await rejects(rpc(ADMIN, "cancel_order", { p_order_id: o.id }), /already cancelled/);
  await rejects(rpc(ADMIN, "confirm_order", { p_order_id: o.id }), /already cancelled/);

  const s = await stockOf(L);
  assert.deepEqual([s.on_hand, s.reserved, s.available], [1, 0, 1]);
  const moves = await as(ADMIN, "select * from public.stock_movements where order_id = $1", [o.id]);
  assert.equal(moves.length, 0);
});

/* ── Reserve → expire ───────────────────────────────────── */

test("reserve → expire: after 24 h the stock frees itself", async () => {
  const L = variantOf(tee, "L").id;
  const r = await order([{ variant_id: L, qty: 1 }], "0788000004");
  const [o] = await as(ADMIN, "select id, expires_at, created_at from public.orders where code = $1", [r.code]);
  assert.equal(new Date(o.expires_at) - new Date(o.created_at), 24 * 3600 * 1000);
  assert.equal((await stockOf(L)).available, 0);

  // pretend a day has passed
  await as("postgres", "update public.orders set expires_at = now() - interval '1 minute' where id = $1", [o.id]);
  let s = await stockOf(L);
  assert.deepEqual([s.on_hand, s.reserved, s.available], [1, 0, 1]);
  assert.equal((await rpc(ADMIN, "admin_stats")).expired, 1);

  // someone else can now order it…
  const r2 = await order([{ variant_id: L, qty: 1 }], "0788000005");
  assert.ok(r2.code);
  // …so the expired order can't be confirmed any more
  await rejects(rpc(ADMIN, "confirm_order", { p_order_id: o.id }), /Not enough stock to confirm .*Hellstar Logo Tee \(L\): 0 left/);

  // once the newer order is cancelled, the expired one can still be confirmed
  const [o2] = await as(ADMIN, "select id from public.orders where code = $1", [r2.code]);
  await rpc(ADMIN, "cancel_order", { p_order_id: o2.id });
  assert.equal((await rpc(ADMIN, "confirm_order", { p_order_id: o.id })).status, "confirmed");
  s = await stockOf(L);
  assert.deepEqual([s.on_hand, s.reserved, s.available, s.sold], [0, 0, 0, 1]);
});

/* ── Returns, restock, manual sales ─────────────────────── */

test("cancelling a confirmed order puts the stock back (a return)", async () => {
  const L = variantOf(tee, "L").id;
  const [o] = await as(ADMIN, "select o.id from public.orders o join public.order_items i on i.order_id = o.id where i.variant_id = $1 and o.status = 'confirmed'", [L]);
  await rpc(ADMIN, "cancel_order", { p_order_id: o.id });
  const s = await stockOf(L);
  assert.deepEqual([s.on_hand, s.available, s.sold], [1, 1, 0]);
  const [m] = await as(ADMIN, "select change, reason from public.stock_movements where order_id = $1 and reason = 'cancel'", [o.id]);
  assert.deepEqual(m, { change: 1, reason: "cancel" });
});

test("restock adds stock and logs it", async () => {
  const M = variantOf(tee, "M").id;
  await rejects(rpc(ADMIN, "restock", { p_variant_id: M, p_qty: 0 }), /between 1 and 10000/);
  const r = await rpc(ADMIN, "restock", { p_variant_id: M, p_qty: 3, p_note: "new delivery" });
  assert.equal(r.on_hand, 3);
  const [m] = await as(ADMIN, "select change, reason, note, admin_id from public.stock_movements where variant_id = $1 order by id desc limit 1", [M]);
  assert.deepEqual(m, { change: 3, reason: "restock", note: "new delivery", admin_id: ADMIN });
});

test("record_sale: an in-shop sale at a discount", async () => {
  const M = variantOf(tee, "M").id;
  const before = await rpc(ADMIN, "admin_stats");
  const r = await rpc(ADMIN, "record_sale", {
    p_items: [{ variant_id: M, qty: 1, unit_price: 20000, colour: "white" }],
    p_name: "Walk-in",
    p_note: "in shop",
  });
  assert.equal(r.total_rwf, 20000);
  const [o] = await as(ADMIN, "select * from public.orders where code = $1", [r.code]);
  assert.deepEqual([o.status, o.source, o.customer_phone], ["confirmed", "manual", null]);
  const s = await stockOf(M);
  assert.deepEqual([s.on_hand, s.sold], [2, 3]);

  const stats = await rpc(ADMIN, "admin_stats");
  assert.equal(stats.today.items - before.today.items, 1);
  assert.equal(stats.today.revenue - before.today.revenue, 20000);

  await rejects(rpc(ADMIN, "record_sale", { p_items: [{ variant_id: M, qty: 5, unit_price: 1 }] }), /Not enough stock: Hellstar Logo Tee \(M\): 2 available/);
  await order([{ variant_id: M, qty: 2 }], "0788000006");
  await rejects(rpc(ADMIN, "record_sale", { p_items: [{ variant_id: M, qty: 1, unit_price: 1 }] }), /2 held by pending orders/);
  await rejects(rpc(ADMIN, "record_sale", { p_items: [{ variant_id: M, qty: 1, unit_price: -5 }] }), /price of 0 or more/);
  await rejects(rpc(STRANGER, "record_sale", { p_items: [{ variant_id: M, qty: 1 }] }), /Only shop admins/);
});

/* ── Editing stock in the product form ──────────────────── */

test("editing sizes: adjustments are logged, reserved stock is protected", async () => {
  const M = variantOf(tee, "M").id; // on_hand 2, 2 reserved by the order above
  const L = variantOf(tee, "L").id; // on_hand 1
  const edit = (variants) =>
    rpc(ADMIN, "save_product", { p: { id: tee.id, name: "Hellstar Logo Tee", category: "T-Shirts", price_rwf: 25000, colours: ["white"], main_photo: "a.jpg", variants } });

  await rejects(edit([{ id: M, size: "M", on_hand: 1 }, { id: L, size: "L", on_hand: 1 }]), /held by pending orders/);
  await rejects(edit([{ id: L, size: "L", on_hand: 1 }]), /before removing it/);

  await edit([
    { id: M, size: "M", on_hand: 4 },
    { id: L, size: "L", on_hand: 1 },
    { size: "XL", on_hand: 2 },
  ]);
  const [m] = await as(ADMIN, "select change, reason from public.stock_movements where variant_id = $1 order by id desc limit 1", [M]);
  assert.deepEqual(m, { change: 2, reason: "adjustment" });

  // remove L: hidden, stock zeroed and logged
  await edit([{ id: M, size: "M", on_hand: 4 }, { size: "XL", on_hand: 2 }]);
  const [l] = await as(ADMIN, "select on_hand, active from public.variants where id = $1", [L]);
  assert.deepEqual(l, { on_hand: 0, active: false });
  const cat = (await catalog()).find((p) => p.id === tee.id);
  assert.deepEqual(cat.variants.map((v) => v.size), ["M", "XL"]);

  // adding "L" back reuses the old row (its history stays attached)
  await edit([{ id: M, size: "M", on_hand: 4 }, { size: "L", on_hand: 1 }, { size: "XL", on_hand: 2 }]);
  const again = (await catalog()).find((p) => p.id === tee.id);
  assert.equal(variantOf(again, "L").id, L);
});

test("saving the form doesn't undo a sale that happened while it was open", async () => {
  const cat = (await catalog()).find((p) => p.id === tee.id);
  const XL = variantOf(cat, "XL").id;
  const [{ on_hand: before }] = await as(ADMIN, "select on_hand from public.variants where id = $1", [XL]);
  const others = cat.variants.filter((v) => v.id !== XL);
  const rows = async () =>
    Promise.all(
      [XL, ...others.map((v) => v.id)].map(async (id) => {
        const [v] = await as(ADMIN, "select id, size, colour, on_hand from public.variants where id = $1", [id]);
        return v;
      }),
    );
  const form = (await rows()).map((v) => ({ id: v.id, size: v.size, colour: v.colour, on_hand: v.on_hand, on_hand_before: v.on_hand }));
  // the form is open… meanwhile one XL is sold in the shop
  await rpc(ADMIN, "record_sale", { p_items: [{ variant_id: XL, qty: 1, unit_price: 25000 }] });
  // …then the form is saved with only the name changed
  await rpc(ADMIN, "save_product", {
    p: { id: tee.id, name: "Hellstar Logo Tee", category: "T-Shirts", price_rwf: 25000, colours: ["white"], main_photo: "a.jpg", variants: form },
  });
  const [{ on_hand: afterSave }] = await as(ADMIN, "select on_hand from public.variants where id = $1", [XL]);
  assert.equal(afterSave, before - 1, "the sale is kept");

  // a number the admin actually changed is applied
  form[0].on_hand = 7;
  await rpc(ADMIN, "save_product", {
    p: { id: tee.id, name: "Hellstar Logo Tee", category: "T-Shirts", price_rwf: 25000, colours: ["white"], main_photo: "a.jpg", variants: form },
  });
  const [{ on_hand: edited }] = await as(ADMIN, "select on_hand from public.variants where id = $1", [XL]);
  assert.equal(edited, 7);
});

/* ── Per-colour stock, limits, hidden products ──────────── */

test("stock per colour: one colour can sell out while another is in stock", async () => {
  const blue = variantOf(shirt, "M", "blue plaid").id;
  const pink = variantOf(shirt, "M", "pink").id;
  const r = await order([{ variant_id: pink, qty: 1 }], "0788000007");
  assert.equal(r.error, "unavailable");
  assert.equal(r.unavailable[0].colour, "pink");
  const ok = await order([{ variant_id: blue, qty: 1, colour: "pink" }], "0788000007");
  const [item] = await as(ADMIN, "select i.colour from public.order_items i join public.orders o on o.id = i.order_id where o.code = $1", [ok.code]);
  assert.equal(item.colour, "blue plaid", "the variant's own colour wins");
});

test("at most 3 waiting orders per phone number", async () => {
  const XL = variantOf((await catalog()).find((p) => p.id === tee.id), "XL").id;
  await rpc(ADMIN, "restock", { p_variant_id: XL, p_qty: 10 });
  for (let i = 0; i < 3; i++) assert.ok((await order([{ variant_id: XL, qty: 1 }], "0788999999")).code);
  assert.equal((await order([{ variant_id: XL, qty: 1 }], "+250788999999")).error, "too_many");
  assert.ok((await order([{ variant_id: XL, qty: 1 }], "0788999998")).code);
});

test("hidden products can't be ordered", async () => {
  const XL = variantOf((await catalog()).find((p) => p.id === tee.id), "XL").id;
  await as(ADMIN, "update public.products set active = false where id = $1", [tee.id]);
  assert.equal((await order([{ variant_id: XL, qty: 1 }], "0788000010")).error, "unavailable");
  assert.deepEqual(await as("anon", "select id from public.variants where id = $1", [XL]), []);
  assert.equal((await as(ADMIN, "select id from public.variants where id = $1", [XL])).length, 1, "admins still see it");
  await as(ADMIN, "update public.products set active = true where id = $1", [tee.id]);
});

test("deleting an admin's login keeps their orders and stock history", async () => {
  const STAFF = "00000000-0000-4000-8000-00000000000c";
  await as("postgres", `insert into auth.users (id, email) values ('${STAFF}', 'staff@example.com')`);
  await as("postgres", `insert into public.admins (user_id) values ('${STAFF}')`);
  const XL = variantOf((await catalog()).find((p) => p.id === tee.id), "XL").id;
  await rpc(STAFF, "restock", { p_variant_id: XL, p_qty: 1 });
  const sale = await rpc(STAFF, "record_sale", { p_items: [{ variant_id: XL, qty: 1, unit_price: 1000 }] });
  await as("postgres", `delete from auth.users where id = '${STAFF}'`);
  const [o] = await as("postgres", "select status, admin_id from public.orders where code = $1", [sale.code]);
  assert.deepEqual(o, { status: "confirmed", admin_id: null });
  assert.equal((await as("postgres", `select count(*)::int as n from public.admins where user_id = '${STAFF}'`))[0].n, 0);
});

test("dashboard numbers", async () => {
  const s = await rpc(ADMIN, "admin_stats");
  const inv = await as(ADMIN, "select sum(on_hand)::int as on_hand, sum(reserved)::int as reserved from public.inventory");
  assert.equal(s.in_stock, inv[0].on_hand);
  assert.equal(s.reserved, inv[0].reserved);
  assert.equal(s.week.items >= s.today.items && s.month.items >= s.today.items, true);
  assert.ok(s.low_stock.every((x) => x.available <= 2));
  assert.ok(s.low_stock.some((x) => x.colour === "pink"));
});
