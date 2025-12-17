import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
