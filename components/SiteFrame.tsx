"use client";

import { usePathname } from "next/navigation";
import ShopFrame from "./ShopFrame";

/**
 * Shop pages get the shop's header, cart and footer; /admin brings its own.
 * (Chosen by path rather than with route groups: a static export of route
 * groups writes navigation files the client can't find.)
 */
export default function SiteFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "";
  if (path === "/admin" || path.startsWith("/admin/")) return <>{children}</>;
  return <ShopFrame>{children}</ShopFrame>;
}
