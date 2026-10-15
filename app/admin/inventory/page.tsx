"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { ErrorBox, Field, Figure, Loading, PageHead, Sheet, Stepper, btn, input } from "@/components/admin/ui";
import Photo from "@/components/Photo";
import { call, fetchInventory, rwf, sizeLabel, type InventoryRow } from "@/lib/admin-data";
import { CATEGORY_ORDER } from "@/lib/config";
import { errorText } from "@/lib/supabase";

const FILTERS = {
  all: "All",
  low: "Low (2 or less)",
  out: "Sold out",
  in: "In stock",
  hidden: "Hidden products",
} as const;
type Filter = keyof typeof FILTERS;

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<InventoryRow | null>(null);

  const load = useCallback(() => {
    setError("");
    return fetchInventory().then(setRows, (e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    document.title = "Stock — Shop admin";
    load();
  }, [load]);

  const categories = useMemo(() => {
    const present = [...new Set((rows ?? []).map((r) => r.category))];
    return [...CATEGORY_ORDER.filter((c) => present.includes(c)), ...present.filter((c) => !CATEGORY_ORDER.includes(c)).sort()];
  }, [rows]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (category && r.category !== category) return false;
      if (filter === "low" && !(r.available <= 2 && r.product_active)) return false;
      if (filter === "out" && r.available > 0) return false;
      if (filter === "in" && r.available <= 0) return false;
      if (filter === "hidden" && r.product_active) return false;
      return !s || `${r.name} ${r.category} ${r.size} ${r.colour}`.toLowerCase().includes(s);
    });
  }, [rows, q, category, filter]);

  const totals = shown.reduce((t, r) => ({ on_hand: t.on_hand + r.on_hand, available: t.available + r.available }), { on_hand: 0, available: 0 });

  return (
    <>
      <PageHead
        title="Stock"
        sub={rows && `${shown.length} size${shown.length === 1 ? "" : "s"} · ${totals.on_hand} on hand · ${totals.available} available`}
        action={<Link href="/admin/product/?new" className={btn.dark}>+ Product</Link>}
      />

      <div className="grid gap-2">
        <input type="search" placeholder="Search name, size, colour" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" aria-label="Search" className={input} />
        <div className="grid grid-cols-2 gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className={input}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Stock" className={input}>
            {Object.entries(FILTERS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <ErrorBox onRetry={load}>{error}</ErrorBox>}
      {!rows && !error && <Loading />}
      {rows && (
        <div className="mt-4" role="table" aria-label="Stock">
          <div role="row" className="sticky top-[calc(56px+env(safe-area-inset-top,0px))] z-10 grid grid-cols-[1fr_repeat(4,42px)] items-end gap-1 border-b border-fg bg-white py-2 text-right text-[10px] font-bold tracking-[0.06em] uppercase">
            <span role="columnheader" className="text-left">Product</span>
            <span role="columnheader">On hand</span>
            <span role="columnheader">Held</span>
            <span role="columnheader">Avail.</span>
            <span role="columnheader">Sold</span>
          </div>
          {shown.length === 0 && <p className="py-8 text-center text-muted">Nothing matches.</p>}
          {shown.map((r) => (
            <button
              key={r.variant_id}
              type="button"
              role="row"
              onClick={() => setOpen(r)}
              className="grid min-h-16 w-full grid-cols-[1fr_repeat(4,42px)] items-center gap-1 border-b border-line py-2 text-right tabular-nums hover:bg-soft"
            >
              <span role="cell" className="min-w-0 text-left">
                <span className="block truncate text-[14px] font-semibold">
                  {r.name}
                  {!r.product_active && <span className="ml-1.5 bg-soft px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-muted uppercase">Hidden</span>}
                </span>
                <span className="block truncate text-[12px] text-muted">
                  {[sizeLabel(r), rwf(r.price_rwf)].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span role="cell" className="text-[15px]">{r.on_hand}</span>
              <span role="cell" className={`text-[15px] ${r.reserved ? "" : "text-line"}`}>{r.reserved}</span>
              <span role="cell" className={`text-[15px] font-bold ${r.available === 0 ? "text-alert" : r.available <= 2 ? "underline decoration-2 underline-offset-4" : ""}`}>
                {r.available}
              </span>
              <span role="cell" className="text-[15px] text-muted">{r.sold}</span>
            </button>
          ))}
        </div>
      )}

      <RowSheet row={open} onClose={() => setOpen(null)} onChanged={load} />
    </>
  );
}

function RowSheet({ row, onClose, onChanged }: { row: InventoryRow | null; onClose: () => void; onChanged: () => Promise<unknown> }) {
  const { toast } = useAdmin();
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<InventoryRow | null>(null);

  useEffect(() => {
    setCurrent(row);
    setQty(1);
    setError("");
  }, [row]);

  const restock = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!current) return;
    const note = String(new FormData(e.currentTarget).get("note") ?? "");
    setBusy(true);
    setError("");
    try {
      const r = await call<{ on_hand: number }>("restock", { p_variant_id: current.variant_id, p_qty: qty, p_note: note || null });
      toast(`Added ${qty} · ${current.name} ${current.size} now ${r.on_hand} on hand`);
      setCurrent({ ...current, on_hand: r.on_hand, available: current.available + qty });
      setQty(1);
      (e.target as HTMLFormElement).reset();
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={!!row} onClose={onClose} title={current?.name ?? ""}>
      {current && (
        <>
          <div className="flex items-center gap-3">
            <Photo file={current.main_photo} alt="" className="h-20 w-16 shrink-0 object-contain" />
            <div className="text-[14px]">
              <p className="font-semibold">{sizeLabel(current) || "One size"}</p>
              <p className="text-muted">
                {current.category} · {rwf(current.price_rwf)}
              </p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            <Figure label="On hand" value={current.on_hand} />
            <Figure label="Held" value={current.reserved} />
            <Figure label="Avail." value={current.available} />
            <Figure label="Sold" value={current.sold} />
          </div>

          <form onSubmit={restock} className="mt-5 grid gap-3 border-t border-fg pt-4">
            <h3 className="label">Restock this size</h3>
            <div className="flex items-center justify-between gap-3">
              <Stepper value={qty} onChange={setQty} min={1} max={10000} label="quantity to add" />
              <span className="text-right text-[13px] text-muted">
                New total
                <br />
                <strong className="text-[17px] text-fg tabular-nums">{current.on_hand + qty}</strong>
              </span>
            </div>
            <Field label="Note (optional)">
              <input name="note" maxLength={200} placeholder="e.g. new delivery" className={input} />
            </Field>
            {error && <ErrorBox>{error}</ErrorBox>}
            <button type="submit" disabled={busy} className={`${btn.dark} w-full`} data-autofocus>
              {busy ? "Adding…" : `Add ${qty} to stock`}
            </button>
          </form>
          <Link href={`/admin/product/?id=${current.product_id}`} className={`${btn.line} mt-2.5 w-full`}>
            Edit product
          </Link>
        </>
      )}
    </Sheet>
  );
}
