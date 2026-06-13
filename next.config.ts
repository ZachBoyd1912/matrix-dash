import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Tree-shake heavy barrel packages so dev compiles (and prod bundles) stay small.
  // lucide-react in particular is imported on nearly every page.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
