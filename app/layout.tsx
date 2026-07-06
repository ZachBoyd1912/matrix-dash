import type { Metadata } from "next";
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
  icons: {
    apple: "/apple-touch-icon.png",
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
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistMono.variable} ${instrumentSerif.variable} ${workSans.variable} ${fragmentMono.variable}`}
      suppressHydrationWarning
    >
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
