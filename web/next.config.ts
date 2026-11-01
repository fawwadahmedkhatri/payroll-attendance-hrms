import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Lets a production build run next to the dev server (NEXT_DIST_DIR=.next-prod) without clashing
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  experimental: {
    // Import only the components/icons actually used instead of whole barrel files
    optimizePackageImports: ["recharts", "motion", "lucide-react"],
  },
  // Dev server: keep compiled pages in memory so switching back to a page doesn't recompile it
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 50,
  },
};

export default nextConfig;
