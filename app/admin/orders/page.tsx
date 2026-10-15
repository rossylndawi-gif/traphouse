"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { OrderCard, type Order } from "@/components/admin/OrderCard";
import { ErrorBox, Loading, PageHead } from "@/components/admin/ui";
import { errorText, supabase } from "@/lib/supabase";

const TABS = { waiting: "Waiting", expired: "Expired", done: "Done" } as const;
type Tab = keyof typeof TABS;

export default function OrdersPage() {
  const { refreshPending } = useAdmin();
  const [tab, setTab] = useState<Tab>("waiting");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setError("");
    const sb = supabase();
    const nowIso = new Date().toISOString();
    let q = sb.from("orders").select("*, order_items(*)");
    if (tab === "waiting") q = q.eq("status", "pending").gt("expires_at", nowIso).order("expires_at");
    else if (tab === "expired") q = q.eq("status", "pending").lte("expires_at", nowIso).order("created_at", { ascending: false });
    else q = q.in("status", ["confirmed", "cancelled"]).order("created_at", { ascending: false }).limit(50);
    const { data, error } = await q;
    if (error) return setError(errorText(error));
    setOrders(data as Order[]);
    setNow(Date.now());
    refreshPending();
  }, [tab, refreshPending]);

  useEffect(() => {
    document.title = "Orders — Shop admin";
    setOrders(null);
    load();
  }, [load]);

  // keep "time left" current; reload when something may have expired
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <PageHead title="Orders" />
      <div role="tablist" className="mb-4 grid grid-cols-3 border border-fg">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-12 text-[12px] font-bold tracking-widest uppercase ${tab === t ? "bg-fg text-white" : ""}`}
          >
            {TABS[t]}
          </button>
        ))}
      </div>
      {tab === "expired" && (
        <p className="mb-3 text-[13px] text-muted">
          These were never confirmed within 24 hours, so their items are already back on sale. Confirm one if the customer still wants it (and it&apos;s still in stock), or cancel to tidy up.
        </p>
      )}
      {error && <ErrorBox onRetry={load}>{error}</ErrorBox>}
      {!orders && !error && <Loading />}
      {orders && orders.length === 0 && (
        <p className="py-10 text-center text-muted">{tab === "waiting" ? "No orders waiting." : tab === "expired" ? "No expired orders." : "No orders yet."}</p>
      )}
      <div className="grid gap-3">
        {orders?.map((o) => (
          <OrderCard key={o.id} order={o} now={now} onChanged={load} />
        ))}
      </div>
    </>
  );
}
