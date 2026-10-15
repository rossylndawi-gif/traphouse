"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { ErrorBox, Figure, Loading, PageHead, btn } from "@/components/admin/ui";
import { call, rwf, sizeLabel, type Stats } from "@/lib/admin-data";
import { errorText } from "@/lib/supabase";

/** Low-stock rows shown before "Show all" (sold-out sizes come first). */
const LOW_SHOWN = 8;

export default function Dashboard() {
  const { email, signOut } = useAdmin();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [allLow, setAllLow] = useState(false);

  const load = useCallback(() => {
    setError("");
    call<Stats>("admin_stats").then(setStats, (e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    document.title = "Dashboard — Shop admin";
    load();
  }, [load]);

  return (
    <>
      <PageHead title="Dashboard" action={<Link href="/admin/product/?new" className={btn.dark}>+ Product</Link>} />
      {error && <ErrorBox onRetry={load}>{error}</ErrorBox>}
      {!stats && !error && <Loading />}
      {stats && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Figure label="Items in stock" value={stats.in_stock} strong />
            <Link href="/admin/orders/" className="block">
              <Figure label="Waiting orders" value={stats.pending} strong />
            </Link>
          </div>
          {(stats.reserved > 0 || stats.expired > 0) && (
            <p className="mt-2 text-[13px] text-muted">
              {stats.reserved > 0 && `${stats.reserved} item${stats.reserved === 1 ? "" : "s"} held by waiting orders. `}
              {stats.expired > 0 && (
                <Link href="/admin/orders/" className="font-semibold text-fg underline">
                  {stats.expired} expired order{stats.expired === 1 ? "" : "s"} to tidy up
                </Link>
              )}
            </p>
          )}

          <h2 className="label mt-7 mb-2">Sales</h2>
          <table className="w-full border-collapse text-[15px]">
            <thead>
              <tr className="border-b border-fg text-left">
                <th className="label py-2 font-bold" />
                <th className="label py-2 text-right">Items</th>
                <th className="label py-2 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Today", stats.today],
                  ["This week", stats.week],
                  ["This month", stats.month],
                ] as const
              ).map(([label, p]) => (
                <tr key={label} className="border-b border-line">
                  <th scope="row" className="py-3 text-left font-semibold">{label}</th>
                  <td className="py-3 text-right tabular-nums">{p.items}</td>
                  <td className="py-3 text-right font-semibold tabular-nums">{rwf(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Link href="/admin/sales/" className="label mt-1 inline-grid min-h-11 place-items-center underline">
            Sales history →
          </Link>

          <h2 className="label mt-6 mb-2">Low stock {stats.low_stock.length > 0 && <span className="text-muted">({stats.low_stock.length})</span>}</h2>
          {stats.low_stock.length === 0 ? (
            <p className="text-muted">Every size has 3 or more available.</p>
          ) : (
            <ul className="border-t border-fg">
              {(allLow ? stats.low_stock : stats.low_stock.slice(0, LOW_SHOWN)).map((r) => (
                <li key={r.variant_id} className="border-b border-line">
                  <Link href={`/admin/product/?id=${r.product_id}`} className="flex min-h-14 items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{r.name}</span>
                      <span className="block text-[13px] text-muted">{sizeLabel(r)}</span>
                    </span>
                    <span className={`shrink-0 text-right tabular-nums ${r.available === 0 ? "text-alert" : ""}`}>
                      <span className="block text-[17px] font-bold">{r.available === 0 ? "Sold out" : `${r.available} left`}</span>
                      {r.reserved > 0 && <span className="block text-xs text-muted">{r.reserved} held</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {!allLow && stats.low_stock.length > LOW_SHOWN && (
            <button type="button" onClick={() => setAllLow(true)} className={`${btn.line} mt-3 w-full`}>
              Show all {stats.low_stock.length}
            </button>
          )}
        </>
      )}

      <div className="mt-10 border-t border-line pt-4 text-[13px] text-muted">
        Logged in as {email}
        <button type="button" onClick={signOut} className="label ml-2 min-h-11 text-fg underline">
          Log out
        </button>
      </div>
    </>
  );
}
