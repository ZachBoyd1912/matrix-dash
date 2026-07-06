import * as React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { THEME_IDS, DEFAULT_THEME } from "@/lib/themes";

function AllProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme={DEFAULT_THEME}
      themes={[...THEME_IDS, "custom"]}
      enableSystem={false}
    >
      {children}
    </ThemeProvider>
  );
}

function renderWithProviders(ui: React.ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export * from "@testing-library/react";
export { renderWithProviders as render };
