import { SITE_URL, WHATSAPP_NUMBER } from "./config";
import { formatRWF, type Product, type Variant } from "./products";

export const waUrl = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

/** Public link to a product page, so the shop can open it straight from the message. */
export const productLink = (p: Pick<Product, "id">) => `${SITE_URL}/product/${p.id}/`;

export type OrderLine = { product: Product; variant: Variant; color: string; qty: number };

export function cartTotals(lines: Pick<OrderLine, "product" | "qty">[]) {
  let total = 0;
  let onRequest = 0;
  for (const l of lines) {
    if (l.product.price == null) onRequest += l.qty;
    else total += l.product.price * l.qty;
  }
  return { total, onRequest };
}

export function orderMessage(lines: OrderLine[], customer: { code?: string; name: string; phone: string }) {
  const { total, onRequest } = cartTotals(lines);
  const items = lines.map(
    ({ product: p, variant, color, qty }) =>
      [
        "• " + p.name,
        color,
        variant.size && "Size " + variant.size,
        "Qty " + qty,
        p.price == null ? "price on request" : formatRWF(p.price * qty),
      ]
        .filter(Boolean)
        .join(" | ") +
      "\n  " +
      productLink(p),
  );
  const totalText =
    total || !onRequest ? formatRWF(total) + (onRequest ? " + items with price on request" : "") : "price on request";
  return [
    customer.code
      ? `Hello Trap House Society, I'd like to order (order ${customer.code}):`
      : "Hello Trap House Society, I'd like to order:",
    "",
    ...items,
    "",
    "Total: " + totalText,
    "",
    "Name: " + customer.name,
    "Phone: " + customer.phone,
    "Delivery address (Kigali) or pick up at the shop:",
  ].join("\n");
}

export function askMessage(p: Product, color?: string, size?: string) {
  const bits = [p.name, color, size && "size " + size].filter(Boolean).join(", ");
  return `Hello Trap House Society, I'm interested in: ${bits}. Is it available?\n${productLink(p)}`;
}
