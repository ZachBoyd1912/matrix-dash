import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // Tree-shake heavy barrel packages so dev compiles (and prod bundles) stay small.
  // lucide-react in particular is imported on nearly every page.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Cross-origin isolation — SCOPED to the Matrix Builder embed only, never global.
  // The embedded app (bolt.new fork on :5001) runs an in-browser WebContainer that
  // needs SharedArrayBuffer, which the browser only grants in a cross-origin-isolated
  // context. So the HOST document must be isolated and delegate it to the iframe via
  // allow="cross-origin-isolated". require-corp (not credentialless) is used because
  // the embed sends CORP: cross-origin, so it loads fine, and require-corp avoids the
  // storage partitioning that tends to break the preview's service worker.
  // A global COEP would block every cross-origin image/script across the dashboard.
  async headers() {
    return [
      {
        source: "/dashboard/matrix-builder",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
