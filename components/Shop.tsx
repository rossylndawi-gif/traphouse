"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { priceText, slugify, type Product } from "@/lib/products";
import { ChevronIcon, SearchIcon } from "./icons";
import Photo from "./Photo";
import { useProducts } from "./Store";

export function FilterChips({ active }: { active?: string }) {
  const { categories } = useProducts();
  return (
    <nav aria-label="Filter by category" className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pt-0.5 pb-1 sm:-mx-6 sm:px-6 lg:flex-wrap lg:overflow-visible">
      {["All", ...categories].map((c) => {
        const on = c === active;
        return (
          <Link
            key={c}
            href={c === "All" ? "/" : `/?category=${slugify(c)}`}
            aria-current={on ? "page" : undefined}
            className={`shrink-0 rounded-full border border-fg px-3.5 py-2 text-xs font-semibold tracking-[0.06em] whitespace-nowrap uppercase transition-colors ${on ? "bg-fg text-white" : "hover:bg-soft"}`}
          >
            {c}
          </Link>
        );
      })}
    </nav>
  );
}

/** Every photo of a product: main, extra views, then the other colours. */
export const photosOf = (p: Product) => [...new Set([p.image, ...p.gallery, ...p.colorImages.filter((f): f is string => !!f)])];

/** Card photo: swipe left/right (or use the arrows on desktop) to see the other photos. */
function CardPhotos({ p, eager }: { p: Product; eager: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const files = photosOf(p);
  const many = files.length > 1;
  const href = `/product/${p.id}/`;

  const go = (i: number) => {
    const t = track.current;
    if (!t) return;
    const n = (i + files.length) % files.length;
    const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    t.scrollTo({ left: n * t.clientWidth, behavior: smooth ? "smooth" : "auto" });
  };

  return (
    <div className="group/photos relative">
      <div
        ref={track}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="no-scrollbar flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain"
        data-testid="card-photos"
      >
        {files.map((f, i) => (
          <Link
            key={f + i}
            href={href}
            tabIndex={i === 0 ? undefined : -1}
            aria-hidden={i === 0 ? undefined : true}
            className="block size-full shrink-0 basis-full snap-center overflow-hidden"
          >
            <Photo
              file={f}
              alt={i === 0 ? p.name : ""}
              eager={eager && i === 0}
              className={`size-full object-contain transition-transform duration-700 ease-out-expo group-hover:scale-[1.03] ${p.soldOut ? "sold-img" : ""}`}
            />
          </Link>
        ))}
      </div>
      {p.soldOut && <SoldBadge />}
      {many && (
        <>
          {(["prev", "next"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => go(index + (d === "prev" ? -1 : 1))}
              aria-label={`${d === "prev" ? "Previous" : "Next"} photo of ${p.name}`}
              className={`absolute top-1/2 -mt-4 hidden size-8 place-items-center rounded-full border border-fg bg-white/90 opacity-0 transition-opacity group-hover/photos:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:grid ${d === "prev" ? "left-1.5" : "right-1.5"}`}
            >
              <ChevronIcon dir={d === "prev" ? "left" : "right"} size={12} />
            </button>
          ))}
          <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center gap-1" aria-hidden="true">
            {files.map((f, i) => (
              <span key={f + i} className={`block size-1.5 rounded-full transition-colors ${i === index ? "bg-fg" : "bg-line"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ProductCard({ p, i }: { p: Product; i: number }) {
  return (
    <article className="reveal group" style={{ "--d": `${(i % 4) * 50}ms` } as React.CSSProperties} data-testid="card" data-sold={p.soldOut || undefined}>
      <CardPhotos p={p} eager={i < 4} />
      <Link href={`/product/${p.id}/`} className="block" tabIndex={-1}>
        <h2 className="mt-2.5 mb-0.5 text-[13px] leading-snug font-semibold tracking-[0.02em] uppercase underline-offset-3 group-hover:underline">{p.name}</h2>
        <p className="text-[13px] tabular-nums">
          {p.soldOut && <span className="sr-only">Sold out. </span>}
          <span className={p.soldOut ? "text-muted line-through" : ""}>{priceText(p)}</span>
        </p>
        {p.size && <p className="text-xs text-muted">Size: {p.size}</p>}
        {p.colors.length > 1 && <p className="text-xs text-muted">{p.colors.length} colours</p>}
      </Link>
    </article>
  );
}

export const SoldBadge = ({ large }: { large?: boolean }) => (
  <span
    className={`pointer-events-none absolute z-2 bg-fg font-extrabold tracking-[0.12em] text-white uppercase ${large ? "top-3 left-3 px-3 py-2 text-[13px]" : "top-2 left-2 px-2 py-1.5 text-[11px]"}`}
  >
    Sold out
  </span>
);

const GRID = "grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-10 lg:grid-cols-4";

export function ProductGrid({ products }: { products: Product[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cards = ref.current?.querySelectorAll<HTMLElement>(".reveal:not(.in)");
    if (!cards?.length) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      cards.forEach((c) => c.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.1 },
    );
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [products]);
  return (
    <div ref={ref} className={GRID}>
      {products.map((p, i) => (
        <ProductCard key={p.id} p={p} i={i} />
      ))}
    </div>
  );
}

export function GridSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading products…</p>
      <div className="no-scrollbar mb-6 flex gap-2 overflow-hidden">
        {[44, 70, 84, 120, 64].map((w, i) => (
          <span key={i} className="shimmer h-[34px] shrink-0 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className={GRID}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i}>
            <div className="shimmer aspect-[4/5]" />
            <div className="shimmer mt-3 h-3 w-4/5" />
            <div className="shimmer mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ShopView() {
  const { products, categories, status } = useProducts();
  const params = useSearchParams();
  const router = useRouter();
  const catSlug = params.get("category") ?? "";
  const q = (params.get("q") ?? "").trim();

  const category = categories.find((c) => slugify(c) === catSlug);
  let items = category ? products.filter((p) => p.category === category) : products;
  if (q) {
    const s = q.toLowerCase();
    items = items.filter((p) => [p.name, p.category, p.size, ...p.colors].join(" ").toLowerCase().includes(s));
  }

  useEffect(() => {
    document.title = (category ? category + " — " : q ? "Search — " : "") + "Trap House Society";
  }, [category, q]);

  const onSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
    router.push(v ? `/?q=${encodeURIComponent(v)}` : "/");
  };

  const title = q ? `Results for “${q}”` : category ?? "Shop all";

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-14 sm:px-6">
      {q && (
        <form onSubmit={onSearch} role="search" className="mt-5 flex border border-fg" key={q}>
          <label htmlFor="page-q" className="sr-only">
            Search products
          </label>
          <input id="page-q" name="q" type="search" defaultValue={q} autoComplete="off" enterKeyHint="search" className="min-w-0 flex-1 bg-white p-3.5 text-base outline-none" />
          <button type="submit" aria-label="Search" className="grid w-[54px] place-items-center bg-fg text-white">
            <SearchIcon />
          </button>
        </form>
      )}
      <h1 className="display mt-6 mb-3.5 text-[30px] sm:text-[40px]">
        {title}{" "}
        {status === "ready" && <span className="align-top text-sm font-medium tracking-normal text-muted normal-case [font-stretch:100%]">{items.length}</span>}
      </h1>
      {status === "loading" ? (
        <GridSkeleton />
      ) : (
        <>
          <FilterChips active={q ? undefined : category ?? (catSlug ? undefined : "All")} />
          {items.length ? (
            <ProductGrid products={items} />
          ) : (
            <div className="py-14 text-center">
              <p className="text-muted">{products.length ? (q ? `No products match “${q}”.` : "Nothing here yet.") : "Products are unavailable right now. Please refresh in a moment."}</p>
              <Link href="/" className="mt-4 inline-flex min-h-12 items-center border border-fg px-5 text-sm font-bold tracking-widest uppercase hover:bg-soft">
                Shop all
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
