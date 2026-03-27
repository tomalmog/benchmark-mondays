import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/bmm",
  transpilePackages: ["@weekly-benchmark/shared"],
};

export default nextConfig;
