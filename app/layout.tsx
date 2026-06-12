import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "next-themes";
import { THEME_IDS, DEFAULT_THEME } from "@/lib/themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matrix Dashboard",
  description: "Your local-first AI command center.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
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
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
