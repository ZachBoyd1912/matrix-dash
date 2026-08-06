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
  // Chat was a dead client-side redirect stub (deleted); Research/Compare/Images
  // moved under /playground with a shared tab layout. Redirects (not the old
  // stub-page pattern) so bookmarks and external links keep working.
  async redirects() {
    return [
      { source: "/dashboard/chat", destination: "/dashboard/sessions?new=1", permanent: true },
      {
        source: "/dashboard/research",
        destination: "/dashboard/playground/research",
        permanent: true,
      },
      {
        source: "/dashboard/compare",
        destination: "/dashboard/playground/compare",
        permanent: true,
      },
      { source: "/dashboard/images", destination: "/dashboard/playground/images", permanent: true },
    ];
  },
};

export default nextConfig;
