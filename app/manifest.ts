import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Matrix Dashboard",
    short_name: "Matrix",
    description: "Your AI command center.",
    start_url: "/dashboard",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#f4ecdd",
    theme_color: "#a8461f",
    categories: ["productivity", "developer tools", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [
      {
        src: "/screenshots/dashboard.png",
        sizes: "1280x800",
        type: "image/png",
        form_factor: "wide",
        label: "Matrix Dashboard — Daily Briefing",
      },
    ],
  };
}
