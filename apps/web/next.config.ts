import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/bmm",
  skipTrailingSlashRedirect: true,
  transpilePackages: ["@weekly-benchmark/shared"],
};

export default nextConfig;
