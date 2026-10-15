"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { ErrorBox, Field, Loading, PageHead, Stepper, btn, input } from "@/components/admin/ui";
import { CloseIcon } from "@/components/icons";
import { call, fetchInventory, rwf, type InventoryRow } from "@/lib/admin-data";
import { CATEGORY_ORDER } from "@/lib/config";
import { errorText, supabase } from "@/lib/supabase";

type Line = { key: string; product: string; variant: string; colour: string; qty: number; price: string };
type ProductInfo = { id: string; name: string; category: string; price_rwf: number | null; colours: string[]; active: boolean; sizes: InventoryRow[] };

const key = () => Math.random().toString(36).slice(2);
const blank = (): Line => ({ key: key(), product: "", variant: "", colour: "", qty: 1, price: "" });
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[,\s]/g, "")));

export default function RecordSalePage() {
  const { toast } = useAdmin();
  const [products, setProducts] = useState<ProductInfo[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const [rows, info] = await Promise.all([fetchInventory(), supabase().from("products").select("id, name, category, price_rwf, colours, active")]);
      if (info.error) throw info.error;
      setProducts(
        (info.data as Omit<ProductInfo, "sizes">[])
          .map((p) => ({ ...p, sizes: rows.filter((r) => r.product_id === p.id) }))
          .filter((p) => p.sizes.length),
      );
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, []);
  useEffect(() => {
    document.title = "Record a sale — Shop admin";
    load();
  }, [load]);

  const byCategory = useMemo(() => {
    const groups = new Map<string, ProductInfo[]>();
    for (const p of [...(products ?? [])].sort((a, b) => a.name.localeCompare(b.name))) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
    return [...groups.entries()].sort(([a], [b]) => {
      const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
  }, [products]);

  const get = (id: string) => products?.find((p) => p.id === id);
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const pickProduct = (i: number, id: string) => {
    const p = get(id);
    const inStock = p?.sizes.filter((s) => s.available > 0) ?? [];
    const only = inStock.length === 1 ? inStock[0] : null;
    update(i, {
      product: id,
      variant: only?.variant_id ?? "",
      colour: only?.colour || (p?.colours.length === 1 ? p.colours[0] : ""),
      qty: 1,
      price: p?.price_rwf == null ? "" : String(p.price_rwf),
    });
  };

  const total = lines.reduce((n, l) => n + (num(l.price) ?? 0) * l.qty, 0);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    const filled = lines.filter((l) => l.product);
    if (!filled.length) return setError("Choose a product.");
    if (filled.some((l) => !l.variant)) return setError("Choose a size for each item.");
    if (filled.some((l) => num(l.price) != null && !(Number.isInteger(num(l.price)) && num(l.price)! >= 0)))
      return setError("Prices must be whole numbers, like 20000.");
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await call<{ code: string; total_rwf: number }>("record_sale", {
        p_items: filled.map((l) => ({ variant_id: l.variant, colour: l.colour, qty: l.qty, unit_price: num(l.price) })),
        p_name: String(f.get("name") ?? "") || null,
        p_phone: String(f.get("phone") ?? "") || null,
        p_note: String(f.get("note") ?? "") || null,
      });
      toast(`Sale ${r.code} recorded · ${rwf(r.total_rwf)}`);
      setLines([blank()]);
      setFormKey((k) => k + 1);
      load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <ErrorBox onRetry={load}>{loadError}</ErrorBox>;
  if (!products) return <Loading />;

  return (
    <form key={formKey} onSubmit={submit} noValidate className="pb-6">
      <PageHead title="Record a sale" sub="For sales on WhatsApp or in the shop that didn't come through the website." />

      <div className="grid gap-3">
        {lines.map((l, i) => {
          const p = get(l.product);
          const v = p?.sizes.find((s) => s.variant_id === l.variant);
          const colourChoice = p && v && !v.colour && p.colours.length > 1;
          return (
            <fieldset key={l.key} className="grid gap-3 border border-fg p-3" data-testid="sale-line">
              <legend className="label flex w-full items-center justify-between px-1">
                Item {i + 1}
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines(lines.filter((_, k) => k !== i))} aria-label={`Remove item ${i + 1}`} className="grid size-10 place-items-center">
                    <CloseIcon size={14} />
                  </button>
                )}
              </legend>
              <Field label="Product">
                <select value={l.product} onChange={(e) => pickProduct(i, e.target.value)} className={input}>
                  <option value="">Choose…</option>
                  {byCategory.map(([cat, ps]) => (
                    <optgroup key={cat} label={cat}>
                      {ps.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                          {x.active ? "" : " (hidden)"}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              {p && (
                <>
                  <Field label="Size">
                    <select value={l.variant} onChange={(e) => update(i, { variant: e.target.value, qty: 1, colour: p.sizes.find((s) => s.variant_id === e.target.value)?.colour || l.colour })} className={input}>
                      <option value="">Choose…</option>
                      {p.sizes.map((s) => (
                        <option key={s.variant_id} value={s.variant_id} disabled={s.available <= 0}>
                          {[s.size, s.colour].filter(Boolean).join(" · ")} — {s.available > 0 ? `${s.available} available` : s.on_hand > 0 ? "all held by orders" : "sold out"}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {colourChoice && (
                    <Field label="Colour">
                      <select value={l.colour} onChange={(e) => update(i, { colour: e.target.value })} className={input}>
                        <option value="">—</option>
                        {p.colours.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="grid gap-1">
                      <span className="text-[13px] font-semibold">Quantity</span>
                      <Stepper value={l.qty} onChange={(n) => update(i, { qty: n })} min={1} max={Math.max(1, v?.available ?? 1)} label="quantity" />
                    </div>
                    <div className="min-w-[140px] flex-1">
                      <Field label="Price each (RWF)">
                        <input value={l.price} onChange={(e) => update(i, { price: e.target.value })} inputMode="numeric" placeholder="On request" className={input} />
                      </Field>
                    </div>
                  </div>
                  {p.price_rwf != null && num(l.price) != null && num(l.price)! < p.price_rwf && (
                    <p className="text-xs text-muted">Discount: {rwf((p.price_rwf - num(l.price)!) * l.qty)} off the shop price.</p>
                  )}
                </>
              )}
            </fieldset>
          );
        })}
        <button type="button" onClick={() => setLines([...lines, blank()])} className={`${btn.line} w-full`}>
          + Add another item
        </button>
      </div>

      <section className="mt-6 grid gap-3">
        <h2 className="label">Customer (optional)</h2>
        <Field label="Name">
          <input name="name" maxLength={80} autoComplete="off" className={input} />
        </Field>
        <Field label="Phone">
          <input name="phone" type="tel" inputMode="tel" maxLength={20} autoComplete="off" className={input} />
        </Field>
        <Field label="Note">
          <input name="note" maxLength={300} placeholder="e.g. paid with MoMo" autoComplete="off" className={input} />
        </Field>
      </section>

      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="sticky bottom-[calc(61px+env(safe-area-inset-bottom,0px))] z-30 -mx-4 mt-6 border-t border-fg bg-white/95 px-4 py-3 backdrop-blur">
        <p className="mb-2 flex justify-between text-base font-extrabold uppercase">
          <span>Total</span>
          <span className="tabular-nums">{rwf(total)}</span>
        </p>
        <button type="submit" disabled={busy} className={`${btn.dark} w-full`}>
          {busy ? "Saving…" : "Record sale"}
        </button>
      </div>
    </form>
  );
}
