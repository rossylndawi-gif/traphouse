import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/traphouse",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
