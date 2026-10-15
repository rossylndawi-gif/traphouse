import type { Metadata } from "next";
import ProductView from "@/components/ProductView";
import { SHOP_NAME, SITE_URL, photo } from "@/lib/config";
import { buildProducts } from "@/lib/build-data";
import { priceText, sizeNames } from "@/lib/products";

/** One page per product in the shop at build time (rebuilt hourly). */
export function generateStaticParams() {
  const products = buildProducts();
  // export needs at least one page; unknown slugs fall back to 404.html, which still shows live products
  return products.length ? products.map((p) => ({ slug: p.id })) : [{ slug: "placeholder" }];
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = buildProducts().find((x) => x.id === slug);
  if (!p) return { title: "Product" };
  const sizes = sizeNames(p);
  const image = photo(p.image);
  const description = [
    p.soldOut ? "Sold out" : priceText(p),
    sizes.length > 0 && `${sizes.length > 1 ? "Sizes" : "Size"} ${sizes.join(", ")}`,
    p.colors.length > 1 ? `${p.colors.length} colours` : p.colors[0],
    "Order on WhatsApp · Remera Kisimenti, Kigali",
  ]
    .filter(Boolean)
    .join(" · ");
  const url = `${SITE_URL}/product/${p.id}/`;
  return {
    title: p.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: SHOP_NAME,
      title: `${p.name} — ${SHOP_NAME}`,
      description,
      url,
      images: [{ url: image, alt: p.name }],
    },
    twitter: { card: "summary_large_image", title: `${p.name} — ${SHOP_NAME}`, description, images: [image] },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProductView slug={slug} />;
}
