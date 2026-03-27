import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/bmm",
  skipTrailingSlashRedirect: true,
  transpilePackages: ["@weekly-benchmark/shared"],
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  },
};

export default nextConfig;
