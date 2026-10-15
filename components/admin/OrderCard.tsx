"use client";

import { useEffect, useRef, useState } from "react";
import { call, dateTime, rwf, timeLeft } from "@/lib/admin-data";
import { errorText } from "@/lib/supabase";
import { useAdmin } from "./AdminShell";
import { ErrorBox, btn } from "./ui";

export type OrderItem = { id: number; product_name: string; size: string; colour: string; qty: number; unit_price: number | null };
export type Order = {
  id: string;
  code: string;
  status: "pending" | "confirmed" | "cancelled";
  source: "website" | "manual";
  customer_name: string | null;
  customer_phone: string | null;
  note: string | null;
  total_rwf: number;
  created_at: string;
  expires_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  order_items: OrderItem[];
};

export function OrderCard({ order: o, now, onChanged }: { order: Order; now: number; onChanged: () => void }) {
  const { toast } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [armed, setArmed] = useState(false);
  const disarm = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(disarm.current), []);

  const run = async (fn: "confirm_order" | "cancel_order") => {
    setBusy(true);
    setError("");
    try {
      await call(fn, { p_order_id: o.id });
      toast(`${o.code} ${fn === "confirm_order" ? "confirmed — stock updated" : o.status === "confirmed" ? "cancelled — items back in stock" : "cancelled"}`);
      onChanged();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  // Cancel needs a second tap within 4 seconds
  const cancel = () => {
    if (!armed) {
      setArmed(true);
      clearTimeout(disarm.current);
      disarm.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    run("cancel_order");
  };

  const left = o.status === "pending" ? timeLeft(o.expires_at, now) : "";
  const phone = o.customer_phone ?? "";
  const items = o.order_items.reduce((n, i) => n + i.qty, 0);

  return (
    <article className={`border p-4 ${o.status === "cancelled" ? "border-line text-muted" : "border-fg"}`} data-testid="order">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="display text-[26px]">{o.code}</h2>
          <p className="text-[12px] text-muted">
            {o.source === "website" ? "Website" : "Recorded sale"} · {dateTime(o.created_at)}
          </p>
        </div>
        <span
          className={`shrink-0 px-2 py-1 text-[11px] font-bold tracking-wide uppercase ${
            o.status === "confirmed" ? "bg-fg text-white" : o.status === "cancelled" ? "bg-soft" : left === "Expired" ? "bg-alert text-white" : "border border-fg"
          }`}
        >
          {o.status === "pending" ? left : o.status}
        </span>
      </header>

      {(o.customer_name || phone) && (
        <p className="mt-3 text-[15px]">
          <span className="font-semibold">{o.customer_name}</span>
          {phone && (
            <>
              {" · "}
              <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener" className="underline">
                +{phone}
              </a>
            </>
          )}
        </p>
      )}

      <ul className="mt-3 border-t border-line">
        {o.order_items.map((i) => (
          <li key={i.id} className="flex justify-between gap-3 border-b border-line py-2 text-[14px]">
            <span className="min-w-0">
              <span className="font-semibold">{i.product_name}</span>
              <span className="block text-[12px] text-muted">{[i.size && `Size ${i.size}`, i.colour, `Qty ${i.qty}`].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="shrink-0 tabular-nums">{i.unit_price == null ? "On request" : rwf(i.unit_price * i.qty)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex justify-between font-extrabold uppercase">
        <span>
          Total <span className="text-[12px] font-medium text-muted normal-case">({items} item{items === 1 ? "" : "s"})</span>
        </span>
        <span className="tabular-nums">{rwf(o.total_rwf)}</span>
      </p>
      {o.note && <p className="mt-2 text-[13px] text-muted">Note: {o.note}</p>}
      {o.status === "cancelled" && o.cancelled_at && <p className="mt-2 text-[12px]">Cancelled {dateTime(o.cancelled_at)}</p>}
      {o.status === "confirmed" && o.confirmed_at && <p className="mt-2 text-[12px] text-muted">Confirmed {dateTime(o.confirmed_at)}</p>}

      {error && <ErrorBox>{error}</ErrorBox>}
      {o.status === "pending" && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={cancel} disabled={busy} className={armed ? `${btn.dark} bg-alert hover:bg-alert` : btn.danger}>
            {armed ? "Tap to cancel" : "Cancel"}
          </button>
          <button type="button" onClick={() => run("confirm_order")} disabled={busy} className={btn.dark}>
            {busy ? "…" : "Confirm"}
          </button>
        </div>
      )}
      {o.status === "confirmed" && (
        <button type="button" onClick={cancel} disabled={busy} className={`${armed ? `${btn.dark} bg-alert hover:bg-alert` : btn.danger} mt-4 w-full`}>
          {armed ? "Tap again: cancel & put items back in stock" : "Cancel / return"}
        </button>
      )}
    </article>
  );
}
