import type { MetadataRoute } from "next";

// This app has no crawler-reachable surface at all — matrix.zbautomations.ie
// sits fully behind Cloudflare Access, so every crawler already hits a login
// wall before this file is ever read. This exists as defense-in-depth for
// the one path that bypasses Cloudflare: a direct request to the origin's
// public IP (the GCE firewall allows 0.0.0.0/0 on 80/443).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
