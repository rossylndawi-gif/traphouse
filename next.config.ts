import type { NextConfig } from "next";

// Vercel serves the site at the domain root; GitHub Pages serves it under /traphouse.
// VERCEL is set automatically during Vercel builds.
const onVercel = !!process.env.VERCEL;
const basePath = onVercel ? "" : "/traphouse";
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const siteUrl =
  process.env.SITE_URL ||
  (onVercel && vercelHost ? `https://${vercelHost}` : "https://rossylndawi-gif.github.io/traphouse");

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_SITE_URL: siteUrl.replace(/\/$/, ""),
  },
};

export default nextConfig;
