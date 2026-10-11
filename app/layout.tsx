import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { CartDrawer, Footer, Header, MenuOverlay, Toast } from "@/components/Chrome";
import { StoreProvider } from "@/components/Store";
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
        <a href="#main" className="sr-only z-100 bg-fg px-3.5 py-2.5 text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2">
          Skip to products
        </a>
        <StoreProvider>
          <Header />
          <MenuOverlay />
          <main id="main" tabIndex={-1} className="min-h-[60vh] outline-none">
            {children}
          </main>
          <Footer />
          <CartDrawer />
          <Toast />
        </StoreProvider>
      </body>
    </html>
  );
}
