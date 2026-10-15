"use client";

/* Cart drawer: items, customer details, and checkout (reserve → WhatsApp). */

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { formatRWF } from "@/lib/products";
import { placeOrder, type Unavailable } from "@/lib/shop-api";
import { cartTotals, orderMessage, waUrl, type OrderLine } from "@/lib/whatsapp";
import { useDialog } from "./Chrome";
import { CloseIcon, WhatsAppIcon } from "./icons";
import Photo from "./Photo";
import { useCart, useProducts, useUI } from "./Store";

type Checkout =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "error"; message: string; unavailable?: Unavailable[] }
  /** Supabase unreachable: the customer can still send the order, unreserved */
  | { kind: "offline"; url: string }
  | { kind: "done"; code: string; url: string };

const BTN = "flex min-h-[52px] w-full items-center justify-center gap-2.5 px-5 text-sm font-bold tracking-widest uppercase";
const BTN_DARK = `${BTN} bg-fg text-white hover:bg-[#2a2a2a] disabled:bg-line disabled:text-muted`;
const BTN_LINE = `${BTN} border border-fg hover:bg-soft`;

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const digits = (s: string) => s.replace(/\D/g, "");

function describe(u: Unavailable) {
  const what = [u.size && `size ${u.size}`, u.colour].filter(Boolean).join(", ");
  return `${u.product}${what ? ` (${what})` : ""}: ${u.available ? `only ${u.available} left` : "sold out"}`;
}

export function CartDrawer() {
  const { panel, close } = useUI();
  const { lines, count, setQty, clear, customer, setCustomer } = useCart();
  const { get, status, refresh } = useProducts();
  const { toast } = useUI();
  const open = panel === "cart";
  const ref = useDialog(open);
  const [checkout, setCheckout] = useState<Checkout>({ kind: "idle" });

  // A finished checkout is shown until the cart is closed
  useEffect(() => {
    if (!open) setCheckout((c) => (c.kind === "done" || c.kind === "offline" ? { kind: "idle" } : c));
  }, [open]);

  const order: (OrderLine & { index: number })[] = lines.flatMap((l, index) => {
    const product = get(l.id);
    const variant = product?.variants.find((v) => v.id === l.variant);
    return product && variant ? [{ product, variant, color: l.color, qty: l.qty, index }] : [];
  });
  const { total, onRequest } = cartTotals(order);
  const wanted = (variantId: string) => order.reduce((n, l) => (l.variant.id === variantId ? n + l.qty : n), 0);
  const short = order.filter((l) => wanted(l.variant.id) > l.variant.available);

  const send = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = customer.name.trim();
    const phone = customer.phone.trim();
    if (!name) return setCheckout({ kind: "error", message: "Please enter your name." });
    if (digits(phone).length < 9) return setCheckout({ kind: "error", message: "Please enter your phone number." });
    if (short.length)
      return setCheckout({
        kind: "error",
        message: "Some items are no longer available. Lower the quantity or remove them:",
        unavailable: short.map((l) => ({
          variant_id: l.variant.id, product: l.product.name, size: l.variant.size, colour: l.color, requested: l.qty, available: l.variant.available,
        })),
      });

    setCheckout({ kind: "sending" });
    let r;
    try {
      r = await placeOrder(order.map((l) => ({ variant_id: l.variant.id, qty: l.qty, colour: l.color })), name, phone);
    } catch (err) {
      console.warn("[order] could not reserve the order:", (err as Error).message);
      return setCheckout({ kind: "offline", url: waUrl(orderMessage(order, { name, phone })) });
    }
    if (r.error) {
      if (r.error === "unavailable") refresh();
      return setCheckout({ kind: "error", message: r.message, unavailable: r.unavailable });
    }
    const url = waUrl(orderMessage(order, { code: r.code, name, phone }));
    clear();
    setCheckout({ kind: "done", code: r.code, url });
    refresh();
    // Opens straight away where the browser allows it; the button below always works
    window.open(url, "_blank", "noopener");
  };

  const busy = checkout.kind === "sending";
  const edit = (c: typeof customer) => {
    setCustomer(c);
    if (checkout.kind === "error") setCheckout({ kind: "idle" });
  };

  return (
    <>
      <div aria-hidden="true" onClick={close} className={`fixed inset-0 z-65 bg-black/40 transition-opacity duration-300 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} />
      <aside
        ref={ref}
        id="cart"
        role="dialog"
        aria-modal="true"
        aria-label="Cart"
        inert={!open}
        className={`fixed inset-y-0 right-0 z-70 flex w-[min(420px,100%)] flex-col border-l border-fg bg-white px-4 pt-[calc(14px+env(safe-area-inset-top,0px))] pb-[calc(16px+env(safe-area-inset-bottom,0px))] transition-transform duration-[350ms] ease-out-expo sm:px-6 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="-mr-2 flex items-center justify-between border-b border-fg pb-2.5">
          <h2 className="display text-[22px]">
            Cart {count > 0 && <span className="text-sm font-medium text-muted normal-case [font-stretch:100%]">({count})</span>}
          </h2>
          <button type="button" onClick={close} aria-label="Close cart" className="grid size-11 place-items-center" data-autofocus>
            <CloseIcon />
          </button>
        </div>

        {checkout.kind === "done" ? (
          <div className="flex-1 overflow-y-auto pt-6" role="status" data-testid="order-done">
            <p className="label text-muted">Order</p>
            <p className="display mt-1 text-[40px]">{checkout.code}</p>
            <p className="mt-3 text-[15px]">
              Your items are held for you for <strong>24 hours</strong>. Send the order on WhatsApp so we can confirm it and arrange delivery or pick-up.
            </p>
            <a href={checkout.url} target="_blank" rel="noopener" className={`${BTN_DARK} mt-6`} data-testid="order-whatsapp">
              <WhatsAppIcon /> Send on WhatsApp
            </a>
            <Link href="/" onClick={close} className={`${BTN_LINE} mt-2.5`}>
              Continue shopping
            </Link>
          </div>
        ) : checkout.kind === "offline" ? (
          <div className="flex-1 overflow-y-auto pt-6" role="alert">
            <p className="text-[15px] font-semibold">We couldn&apos;t reserve your items right now.</p>
            <p className="mt-2 text-[15px]">You can still send the order on WhatsApp and we&apos;ll check the stock for you.</p>
            <a href={checkout.url} target="_blank" rel="noopener" onClick={() => clear()} className={`${BTN_DARK} mt-6`}>
              <WhatsAppIcon /> Send on WhatsApp
            </a>
            <button type="button" onClick={() => setCheckout({ kind: "idle" })} className={`${BTN_LINE} mt-2.5`}>
              Back to cart
            </button>
          </div>
        ) : (
          <form onSubmit={send} className="flex min-h-0 flex-1 flex-col" noValidate>
            <div className="-mx-4 flex-1 overflow-y-auto px-4 sm:-mx-6 sm:px-6" aria-live="polite">
              {status === "loading" && lines.length > 0 ? (
                <p className="pt-6 text-muted">Loading your cart…</p>
              ) : order.length === 0 ? (
                <div className="pt-6">
                  <p className="text-muted">Your cart is empty.</p>
                  <Link href="/" onClick={close} className="mt-4 inline-flex min-h-12 items-center border border-fg px-5 text-sm font-bold tracking-widest uppercase hover:bg-soft">
                    Continue shopping
                  </Link>
                </div>
              ) : (
                <>
                  <ul>
                    {order.map(({ product: p, variant, color, qty, index }) => {
                      const k = p.colors.indexOf(color);
                      const img = (k >= 0 && p.colorImages[k]) || p.image;
                      const left = variant.available;
                      const over = wanted(variant.id) > left;
                      return (
                        <li key={`${variant.id}-${color}`} className="grid grid-cols-[72px_1fr_auto] gap-3 border-b border-line py-3.5 text-[13px]">
                          <Link href={`/product/${p.id}/`} onClick={close} tabIndex={-1} aria-hidden="true">
                            <Photo file={img} alt="" className={`h-[90px] w-[72px] object-contain ${left ? "" : "sold-img"}`} />
                          </Link>
                          <div className="min-w-0">
                            <Link href={`/product/${p.id}/`} onClick={close} className="block leading-snug font-semibold uppercase">
                              {p.name}
                            </Link>
                            <p className="mt-0.5 text-muted">{[cap(color), variant.size && "Size: " + variant.size].filter(Boolean).join(" · ")}</p>
                            {over && (
                              <p className="mt-0.5 font-semibold text-alert">{left ? `Only ${left} left` : "Sold out — please remove it"}</p>
                            )}
                            <div className="mt-2 inline-flex items-center border border-line" role="group" aria-label={`Quantity for ${p.name}`}>
                              <button type="button" onClick={() => setQty(index, qty - 1)} aria-label="Decrease quantity" className="size-11 text-base">
                                −
                              </button>
                              <span className="min-w-[26px] text-center tabular-nums">{qty}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const why = setQty(index, qty + 1);
                                  if (why) toast(why);
                                }}
                                aria-label="Increase quantity"
                                className="size-11 text-base"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <div className="flex flex-col items-end justify-between">
                            <button type="button" onClick={() => setQty(index, 0)} aria-label={`Remove ${p.name}`} className="-mt-2 -mr-2.5 grid size-11 place-items-center text-muted hover:text-fg">
                              <CloseIcon size={13} />
                            </button>
                            <span className="whitespace-nowrap tabular-nums">{p.price == null ? "On request" : formatRWF(p.price * qty)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <fieldset className="mt-5 mb-2 grid gap-3" disabled={busy}>
                    <legend className="label mb-2.5">Your details</legend>
                    <label className="grid gap-1">
                      <span className="text-[13px] font-semibold">Name</span>
                      <input
                        name="name"
                        autoComplete="name"
                        value={customer.name}
                        onChange={(e) => edit({ ...customer, name: e.target.value })}
                        maxLength={80}
                        required
                        className="min-h-12 border border-fg bg-white px-3.5 text-base outline-none focus:border-2"
                      />
                    </label>
                    <label className="grid gap-1">
                      <span className="text-[13px] font-semibold">Phone (WhatsApp)</span>
                      <input
                        name="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="07xx xxx xxx"
                        value={customer.phone}
                        onChange={(e) => edit({ ...customer, phone: e.target.value })}
                        maxLength={20}
                        required
                        className="min-h-12 border border-fg bg-white px-3.5 text-base outline-none focus:border-2"
                      />
                    </label>
                  </fieldset>
                </>
              )}
            </div>

            {order.length > 0 && (
              <div className="pt-3">
                {checkout.kind === "error" && (
                  <div role="alert" className="mb-3 border border-alert p-3 text-[13px] text-alert" data-testid="order-error">
                    <p className="font-semibold">{checkout.message}</p>
                    {checkout.unavailable && checkout.unavailable.length > 0 && (
                      <ul className="mt-1 list-disc pl-4">
                        {checkout.unavailable.map((u) => (
                          <li key={u.variant_id + u.colour}>{describe(u)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <p className="mb-1 flex justify-between text-base font-extrabold uppercase">
                  <span>Total</span>
                  <span className="tabular-nums">{total || !onRequest ? formatRWF(total) : "On request"}</span>
                </p>
                {onRequest > 0 && total > 0 && (
                  <p className="text-xs text-muted">
                    + {onRequest} item{onRequest === 1 ? "" : "s"} with price on request — we&apos;ll confirm on WhatsApp.
                  </p>
                )}
                <p className="mt-1 mb-2 text-xs text-muted">We hold your items for 24 hours and open WhatsApp with your order ready to send.</p>
                <button type="submit" disabled={busy} className={BTN_DARK} data-testid="order-submit">
                  <WhatsAppIcon /> {busy ? "Reserving…" : "Order on WhatsApp"}
                </button>
              </div>
            )}
          </form>
        )}
      </aside>
    </>
  );
}
