import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Auth-metrics E2E may run beside a developer-owned `next dev` process.
  // Its isolated ignored distDir prevents Next's single-dev-lock from
  // colliding without touching the normal `.next` output.
  distDir: process.env.VO_NEXT_DIST_DIR || '.next',
  typescript: {
    tsconfigPath: process.env.VO_NEXT_TSCONFIG || 'tsconfig.json',
  },
};

export default nextConfig;
