"use client";

import { useCallback, useEffect, useState } from "react";
import type { Order } from "@/components/admin/OrderCard";
import { ErrorBox, Field, Loading, PageHead, btn, input } from "@/components/admin/ui";
import { dateTime, rwf } from "@/lib/admin-data";
import { errorText, supabase } from "@/lib/supabase";

/** Rwanda is UTC+2 all year. */
const TZ = "+02:00";
const kigaliDate = (d: Date) => new Date(d.getTime() + 2 * 3600_000).toISOString().slice(0, 10);
const addDays = (ymd: string, n: number) => kigaliDate(new Date(new Date(`${ymd}T12:00:00${TZ}`).getTime() + n * 86400_000));

function presets() {
  const today = kigaliDate(new Date());
  const dow = (new Date(`${today}T12:00:00${TZ}`).getUTCDay() + 6) % 7; // Monday = 0
  return {
    Today: [today, today],
    "This week": [addDays(today, -dow), today],
    "This month": [today.slice(0, 8) + "01", today],
    "Last 30 days": [addDays(today, -29), today],
  } as Record<string, [string, string]>;
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function SalesPage() {
  const [range, setRange] = useState<[string, string]>(() => presets()["This month"]);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setOrders(null);
    const [from, to] = range;
    const { data, error } = await supabase()
      .from("orders")
      .select("*, order_items(*)")
      .eq("status", "confirmed")
      .gte("confirmed_at", `${from}T00:00:00${TZ}`)
      .lt("confirmed_at", `${addDays(to, 1)}T00:00:00${TZ}`)
      .order("confirmed_at", { ascending: false })
      .limit(2000);
    if (error) return setError(errorText(error));
    setOrders(data as Order[]);
  }, [range]);
  useEffect(() => {
    document.title = "Sales — Shop admin";
    load();
  }, [load]);

  const items = (orders ?? []).flatMap((o) => o.order_items);
  const count = items.reduce((n, i) => n + i.qty, 0);
  const revenue = (orders ?? []).reduce((n, o) => n + o.total_rwf, 0);

  const exportCsv = () => {
    const head = ["Date", "Time", "Order", "Source", "Customer", "Phone", "Product", "Size", "Colour", "Qty", "Unit price (RWF)", "Line total (RWF)", "Note"];
    const rows = (orders ?? []).flatMap((o) => {
      const at = new Date(o.confirmed_at ?? o.created_at);
      const [date, time] = new Date(at.getTime() + 2 * 3600_000).toISOString().slice(0, 16).split("T");
      return o.order_items.map((i) => [
        date, time, o.code, o.source === "website" ? "Website" : "Recorded", o.customer_name, o.customer_phone,
        i.product_name, i.size, i.colour, i.qty, i.unit_price, i.unit_price == null ? "" : i.unit_price * i.qty, o.note,
      ]);
    });
    // BOM so Excel opens the file as UTF-8
    const csv = "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `trap-house-sales_${range[0]}_to_${range[1]}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const p = presets();
  return (
    <>
      <PageHead title="Sales" />
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {Object.entries(p).map(([label, r]) => {
          const on = r[0] === range[0] && r[1] === range[1];
          return (
            <button
              key={label}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={on}
              className={`min-h-11 shrink-0 rounded-full border border-fg px-4 text-xs font-semibold tracking-[0.06em] whitespace-nowrap uppercase ${on ? "bg-fg text-white" : ""}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="From">
          <input type="date" value={range[0]} max={range[1]} onChange={(e) => e.target.value && setRange([e.target.value, range[1]])} className={input} />
        </Field>
        <Field label="To">
          <input type="date" value={range[1]} min={range[0]} onChange={(e) => e.target.value && setRange([range[0], e.target.value])} className={input} />
        </Field>
      </div>

      {error && <ErrorBox onRetry={load}>{error}</ErrorBox>}
      {!orders && !error && <Loading />}
      {orders && (
        <>
          <div className="mt-4 grid grid-cols-3 border border-fg text-center">
            {[
              ["Sales", orders.length],
              ["Items", count],
              ["Revenue", rwf(revenue)],
            ].map(([l, v]) => (
              <div key={l} className="border-r border-line p-2.5 last:border-r-0">
                <p className="label text-[10px] text-muted">{l}</p>
                <p className="mt-0.5 text-[15px] font-extrabold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <button type="button" onClick={exportCsv} disabled={!orders.length} className={`${btn.line} mt-3 w-full`}>
            Export CSV
          </button>

          {orders.length === 0 ? (
            <p className="py-10 text-center text-muted">No sales in this period.</p>
          ) : (
            <ul className="mt-4 border-t border-fg">
              {orders.map((o) => (
                <li key={o.id} className="border-b border-line py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-bold">
                      {o.code} <span className="text-[12px] font-medium text-muted">{o.source === "website" ? "Website" : "Recorded"}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{rwf(o.total_rwf)}</span>
                  </div>
                  <p className="text-[12px] text-muted">
                    {dateTime(o.confirmed_at ?? o.created_at)}
                    {o.customer_name && ` · ${o.customer_name}`}
                  </p>
                  <ul className="mt-1 text-[13px]">
                    {o.order_items.map((i) => (
                      <li key={i.id}>
                        {i.qty} × {i.product_name}
                        <span className="text-muted">{[i.size && ` · ${i.size}`, i.colour && ` · ${i.colour}`].join("")}</span>
                        {i.unit_price != null && <span className="text-muted"> · {rwf(i.unit_price)}</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
