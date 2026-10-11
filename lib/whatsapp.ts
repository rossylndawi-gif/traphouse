import { WHATSAPP_NUMBER } from "./config";
import { formatRWF, type Product } from "./products";

export const waUrl = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

export type OrderLine = { product: Product; color: string; qty: number };

export function cartTotals(lines: OrderLine[]) {
  let total = 0;
  let onRequest = 0;
  for (const l of lines) {
    if (l.product.price == null) onRequest += l.qty;
    else total += l.product.price * l.qty;
  }
  return { total, onRequest };
}

export function orderMessage(lines: OrderLine[]) {
  const { total, onRequest } = cartTotals(lines);
  const items = lines.map(({ product: p, color, qty }) =>
    [
      "• " + p.name,
      color,
      p.size && "Size " + p.size,
      "Qty " + qty,
      p.price == null ? "price on request" : formatRWF(p.price * qty),
    ]
      .filter(Boolean)
      .join(" | "),
  );
  const totalText =
    total || !onRequest ? formatRWF(total) + (onRequest ? " + items with price on request" : "") : "price on request";
  return [
    "Hello Trap House Society, I'd like to order:",
    "",
    ...items,
    "",
    "Total: " + totalText,
    "",
    "Name:",
    "Delivery address (Kigali) or pick up at the shop:",
  ].join("\n");
}

export function askMessage(p: Product, color?: string) {
  const bits = [p.name, color, p.size && "size " + p.size].filter(Boolean).join(", ");
  return `Hello Trap House Society, I'm interested in: ${bits}. Is it available?`;
}
