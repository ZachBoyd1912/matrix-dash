"use client";

import { useEffect } from "react";
import { customThemeToCss, type CustomTheme } from "@/lib/themes";

export const CUSTOM_THEME_STYLE_ID = "mx-custom-theme";

/** Inject or replace the runtime <style> that defines :root[data-theme="custom"]. */
export function applyCustomThemeStyle(theme: CustomTheme) {
  if (typeof document === "undefined") return;
  let el = document.getElementById(CUSTOM_THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = CUSTOM_THEME_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = customThemeToCss(theme);
}

export type UiFont = "sans" | "mono" | "system";
export type UiDensity = "compact" | "comfortable" | "spacious";

const FONT_STACK: Record<UiFont, string> = {
  sans: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  mono: "var(--font-geist-mono), ui-monospace, monospace",
  system: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

const DENSITY_PX: Record<UiDensity, string> = {
  compact: "14px",
  comfortable: "15px",
  spacious: "16px",
};

/** Apply font / density / frosted UI preferences to <html>. */
export function applyUiPrefs(prefs: { font?: UiFont; density?: UiDensity; frosted?: boolean }) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (prefs.font) root.style.setProperty("--font-sans", FONT_STACK[prefs.font]);
  if (prefs.density) root.style.fontSize = DENSITY_PX[prefs.density];
  if (typeof prefs.frosted === "boolean") root.dataset.frosted = prefs.frosted ? "on" : "off";
}

/**
 * Restores the user's saved custom theme on every page load so that
 * `data-theme="custom"` (which next-themes may restore from localStorage) has
 * its CSS variables defined regardless of which page the app boots into.
 */
export function ThemeStyle() {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: Record<string, string>) => {
        if (cancelled) return;
        if (s.customTheme) {
          try {
            applyCustomThemeStyle(JSON.parse(s.customTheme) as CustomTheme);
          } catch {
            /* malformed saved theme — ignore */
          }
        }
        applyUiPrefs({
          font: (s.uiFont as UiFont) || undefined,
          density: (s.uiDensity as UiDensity) || undefined,
          frosted: s.uiFrosted ? s.uiFrosted !== "0" : undefined,
        });
      })
      .catch(() => {
        /* settings unavailable — default themes still work */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
