import { Suspense } from "react";
import ShopView, { GridSkeleton } from "@/components/Shop";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[1200px] px-4 pt-[86px] sm:px-6">
          <GridSkeleton />
        </div>
      }
    >
      <ShopView />
    </Suspense>
  );
}
