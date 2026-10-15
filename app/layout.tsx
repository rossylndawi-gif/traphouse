import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import SiteFrame from "@/components/SiteFrame";
import { SHOP_NAME, SITE_URL, asset } from "@/lib/config";
import "./globals.css";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });

const description =
  "Trap House Society — streetwear shop in Remera Kisimenti, Kigali. Shirts, tees, hoodies, jeans, boxers and bags. Order on WhatsApp.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL + "/"),
  title: { default: `${SHOP_NAME} — Kigali Streetwear`, template: `%s — ${SHOP_NAME}` },
  description,
  icons: { icon: asset("icon.png"), apple: asset("icon.png") },
  openGraph: {
    type: "website",
    siteName: SHOP_NAME,
    title: `${SHOP_NAME} — Kigali Streetwear`,
    description: "Browse the catalogue and order on WhatsApp. Remera Kisimenti, behind Ecobank, KG 18.",
    url: SITE_URL + "/",
    images: [{ url: SITE_URL + "/og.jpg", width: 1200, height: 630, alt: SHOP_NAME }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="font-sans">
        <SiteFrame>{children}</SiteFrame>
      </body>
    </html>
  );
}
