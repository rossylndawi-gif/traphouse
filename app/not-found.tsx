"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ProductView, { ProductSkeleton } from "@/components/ProductView";
import { BASE_PATH } from "@/lib/config";

/**
 * GitHub Pages serves this page for any unknown address.
 * A product added to the sheet after the last build has no page of its own
 * yet, so its /product/<slug>/ link lands here: show it from the live sheet.
 */
export default function NotFound() {
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const path = location.pathname.replace(BASE_PATH, "");
    const m = path.match(/^\/product\/([a-z0-9-]+)\/?$/);
    setSlug(m ? m[1] : null);
  }, []);

  if (slug === undefined) return <ProductSkeleton />;
  if (slug) return <ProductView slug={slug} />;
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-16 text-center sm:px-6">
      <h1 className="display text-[30px]">Page not found</h1>
      <p className="mt-2 text-muted">This page doesn&apos;t exist.</p>
      <Link href="/" className="mt-5 inline-flex min-h-12 items-center bg-fg px-5 text-sm font-bold tracking-widest text-white uppercase">
        Shop all
      </Link>
    </div>
  );
}
