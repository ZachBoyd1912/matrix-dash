import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // Tree-shake heavy barrel packages so dev compiles (and prod bundles) stay small.
  // lucide-react in particular is imported on nearly every page.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Next's build-time type-check/lint pass runs in its own worker process
  // that doesn't reliably inherit NODE_OPTIONS' heap size, and reproducibly
  // OOMs on the ~955MB-RAM production VM. `pnpm typecheck` is already the
  // required, separately-run gate before every push (see CLAUDE.md) — this
  // just stops the redundant in-build recheck from crashing the deploy.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
