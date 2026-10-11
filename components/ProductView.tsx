"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ADDRESS, MAPS_URL } from "@/lib/config";
import { priceText, slugify, type Product } from "@/lib/products";
import { askMessage, waUrl } from "@/lib/whatsapp";
import { ChevronIcon, WhatsAppIcon } from "./icons";
import Photo from "./Photo";
import { SoldBadge } from "./Shop";
import { useCart, useProducts, useUI } from "./Store";

function Gallery({ files, alt, sold }: { files: string[]; alt: string; sold: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const many = files.length > 1;
  const key = files.join("|");

  // New photo set (colour change): jump back to the first photo
  useEffect(() => {
    track.current?.scrollTo({ left: 0 });
    setIndex(0);
  }, [key]);

  const go = (i: number) => {
    const t = track.current;
    if (!t) return;
    const n = (i + files.length) % files.length;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    t.scrollTo({ left: n * t.clientWidth, behavior: smooth ? "smooth" : "auto" });
  };

  return (
    <div className="relative -mx-4 sm:-mx-6 lg:mx-0" data-testid="gallery">
      <div
        ref={track}
        tabIndex={0}
        aria-label={`${alt} photos`}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") go(index - 1);
          if (e.key === "ArrowRight") go(index + 1);
        }}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {files.map((f, i) => (
          <div key={f + i} className="grid aspect-[4/5] shrink-0 basis-full snap-center place-items-center">
            <Photo
              file={f}
              alt={many ? `${alt} — photo ${i + 1} of ${files.length}` : alt}
              eager={i === 0}
              className={`size-full object-contain ${sold ? "sold-img" : ""}`}
            />
          </div>
        ))}
      </div>
      {sold && <SoldBadge large />}
      {many && (
        <>
          {(["prev", "next"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => go(index + (d === "prev" ? -1 : 1))}
              aria-label={d === "prev" ? "Previous photo" : "Next photo"}
              className={`absolute top-1/2 -mt-8 grid size-10 place-items-center rounded-full border border-fg bg-white/90 ${d === "prev" ? "left-2.5" : "right-2.5"}`}
            >
              <ChevronIcon dir={d === "prev" ? "left" : "right"} size={14} />
            </button>
          ))}
          <div className="flex justify-center gap-0.5 pt-2">
            {files.map((f, i) => (
              <button
                key={f + i}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
                className="grid size-6 place-items-center"
              >
                <span className={`block size-1.5 rounded-full transition-colors ${i === index ? "bg-fg" : "bg-line"}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ProductSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-14 sm:px-6 lg:grid lg:grid-cols-[1.15fr_1fr] lg:gap-14" aria-busy="true">
      <p className="sr-only">Loading product…</p>
      <div>
        <div className="shimmer mt-2 mb-2 h-4 w-24" />
        <div className="shimmer -mx-4 aspect-[4/5] sm:-mx-6 lg:mx-0" />
      </div>
      <div className="lg:pt-14">
        <div className="shimmer mt-5 h-8 w-3/4" />
        <div className="shimmer mt-3 h-5 w-1/3" />
        <div className="shimmer mt-8 h-[52px] w-full" />
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-16 text-center sm:px-6">
      <h1 className="display text-[30px]">Not found</h1>
      <p className="mt-2 text-muted">This product may have been removed.</p>
      <Link href="/" className="mt-5 inline-flex min-h-12 items-center bg-fg px-5 text-sm font-bold tracking-widest text-white uppercase">
        Shop all
      </Link>
    </div>
  );
}

export default function ProductView({ slug }: { slug: string }) {
  const { status, get } = useProducts();
  if (status === "loading") return <ProductSkeleton />;
  const p = get(slug);
  if (!p) return <NotFound />;
  return <ProductDetail key={p.id} p={p} />;
}

function ProductDetail({ p }: { p: Product }) {
  const { add } = useCart();
  const { open } = useUI();
  const [ci, setCi] = useState(0);
  const color = p.colors[ci] ?? "";
  const hasColorPhotos = p.colorImages.some(Boolean);
  const files = [(hasColorPhotos && p.colorImages[ci]) || p.image, ...p.gallery];

  useEffect(() => {
    document.title = `${p.name} — Trap House Society`;
    window.scrollTo(0, 0);
  }, [p.name]);

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-14 sm:px-6 lg:grid lg:grid-cols-[1.15fr_1fr] lg:items-start lg:gap-14">
      <div className="lg:sticky lg:top-20">
        <Link href={`/?category=${slugify(p.category)}`} className="label mt-1.5 inline-flex min-h-11 items-center gap-2">
          <ChevronIcon /> {p.category}
        </Link>
        <Gallery files={files} alt={p.name} sold={p.soldOut} />
      </div>

      <div className="lg:pt-14">
        <h1 className="display mt-5 mb-1.5 text-[30px] text-balance lg:text-[44px]">{p.name}</h1>
        <p className={`text-lg font-semibold tabular-nums ${p.soldOut ? "text-muted line-through" : ""}`} data-testid="price">
          {priceText(p)}
        </p>
        {p.soldOut && <p className="mt-1.5 font-semibold">Sold out — message us to ask about a restock.</p>}
        {p.size && (
          <p className="mt-4 text-[15px]" data-testid="size">
            <span className="label mr-1.5">Size:</span> {p.size}
          </p>
        )}

        {p.colors.length > 0 && (
          <fieldset className="mt-5 min-w-0">
            <legend className="label mb-2.5">
              Colour <span className="font-medium tracking-normal text-muted normal-case">— {color}</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {p.colors.map((c, k) => {
                const thumb = p.colorImages[k];
                const on = k === ci;
                return (
                  <button
                    key={c + k}
                    type="button"
                    onClick={() => setCi(k)}
                    aria-pressed={on}
                    title={c}
                    className={`text-[13px] capitalize transition-colors ${on ? "border-2 border-fg" : "border border-line hover:border-muted"} ${
                      thumb ? "flex w-[76px] flex-col items-center gap-1 px-1 pt-1 pb-1.5 text-center text-[11px] leading-tight" : "inline-flex min-h-10 items-center px-3.5 py-2"
                    }`}
                  >
                    {thumb && <Photo file={thumb} alt="" className="aspect-square w-full object-contain" />}
                    <span>{c}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <button
          type="button"
          disabled={p.soldOut}
          onClick={() => {
            add(p.id, color);
            open("cart");
          }}
          className="mt-7 flex min-h-[52px] w-full items-center justify-center bg-fg px-5 text-sm font-bold tracking-widest text-white uppercase transition hover:bg-[#2a2a2a] active:scale-[0.99] disabled:bg-line disabled:text-muted disabled:active:scale-100"
        >
          {p.soldOut ? "Sold out" : "Add to cart"}
        </button>
        <a
          href={waUrl(askMessage(p, color))}
          target="_blank"
          rel="noopener"
          className="mt-2.5 flex min-h-[52px] w-full items-center justify-center gap-2.5 border border-fg px-5 text-sm font-bold tracking-widest uppercase hover:bg-soft"
        >
          <WhatsAppIcon /> Ask about this item
        </a>

        <div className="mt-7 border-b border-fg">
          <Section title="Details" open>
            <li>Category: {p.category}</li>
            {p.size && <li>Size: {p.size}</li>}
            {p.colors.length > 0 && <li>Colours: {p.colors.join(", ")}</li>}
          </Section>
          <Section title="How to order">
            <li>Add items to your cart and tap “Order on WhatsApp”. Your order is sent to us as a message.</li>
            <li>We confirm stock and delivery in Kigali with you on WhatsApp.</li>
          </Section>
          <Section title="Visit the shop">
            <li>{ADDRESS}</li>
            <li>
              <a href={MAPS_URL} target="_blank" rel="noopener" className="underline">
                Open in Google Maps
              </a>
            </li>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="acc border-t border-fg" open={open}>
      <summary className="label flex min-h-[52px] cursor-pointer items-center justify-between text-[13px]">{title}</summary>
      <ul className="mb-4.5 list-disc pl-4.5 text-sm leading-[1.7]">{children}</ul>
    </details>
  );
}
