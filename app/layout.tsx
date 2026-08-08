import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { Instrument_Serif, Work_Sans, Fragment_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { THEME_IDS, DEFAULT_THEME } from "@/lib/themes";
import { GlobalErrorBoundary } from "@/components/layout/error-boundary";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["italic", "normal"],
  variable: "--font-instrument-serif",
});
const workSans = Work_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-work-sans",
});
const fragmentMono = Fragment_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-fragment-mono",
});

const SITE_URL = "https://matrix.zbautomations.ie";
const SITE_TITLE = "Matrix Dashboard";
const SITE_DESCRIPTION = "Your local-first AI command center.";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  robots: { index: false, follow: false },
  alternates: { canonical: SITE_URL },
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4ecdd" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  icons: {
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Matrix",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_TITLE,
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
  other: {
    "google-site-verification": "GUiEmulK8l2VasAwqI03Vy639GgRrH6uRRbgavVyRFc",
    "format-detection": "telephone=no",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistMono.variable} ${instrumentSerif.variable} ${workSans.variable} ${fragmentMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* iOS splash screens — device-specific media queries so the launch image
            fills the entire screen. Each targets one iPhone resolution range.
            Generated on-demand by /api/pwa/splash?w=&h= at first request. */}
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/api/pwa/splash?w=1290&h=2796"
        />
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/api/pwa/splash?w=1179&h=2556"
        />
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/api/pwa/splash?w=1284&h=2778"
        />
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/api/pwa/splash?w=1170&h=2532"
        />
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/api/pwa/splash?w=1125&h=2436"
        />
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/api/pwa/splash?w=1242&h=2688"
        />
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/api/pwa/splash?w=828&h=1792"
        />
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/api/pwa/splash?w=750&h=1334"
        />
        <link
          rel="apple-touch-startup-image"
          media="screen and (device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/api/pwa/splash?w=640&h=1136"
        />
      </head>
      <body>
        <ThemeProvider
          attribute="data-theme"
          defaultTheme={DEFAULT_THEME}
          themes={[...THEME_IDS, "custom"]}
          enableSystem={false}
          disableTransitionOnChange
        >
          <GlobalErrorBoundary>{children}</GlobalErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  );
}
