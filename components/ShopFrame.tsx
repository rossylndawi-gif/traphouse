import { CartDrawer } from "./Cart";
import { Footer, Header, MenuOverlay, Toast } from "./Chrome";
import { StoreProvider } from "./Store";

/** Everything around a shop page: header, menu, cart, footer. Not used by /admin. */
export default function ShopFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
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
    </>
  );
}
