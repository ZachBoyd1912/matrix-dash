"use client";

import { useEffect, useState } from "react";
import { NEUTRAL_TOKENS, type EmailThemeTokens } from "@/lib/utils/email-theme";

/** Read one CSS custom property off the document root, with a fallback. */
function readVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function readTokens(): EmailThemeTokens {
  return {
    background: readVar("--color-bg-surface", NEUTRAL_TOKENS.background),
    text: readVar("--color-text-primary", NEUTRAL_TOKENS.text),
    muted: readVar("--color-text-muted", NEUTRAL_TOKENS.muted),
    link: readVar("--color-sky-accent", NEUTRAL_TOKENS.link),
    border: readVar("--color-text-muted", NEUTRAL_TOKENS.border),
  };
}

/**
 * The active theme's colours, re-read whenever the user switches theme.
 *
 * The email body renders inside an iframe, which cannot inherit the parent's
 * CSS variables — the values have to be resolved here and written into the
 * frame's own stylesheet. That means a theme switch would otherwise leave the
 * open message painted in the previous theme until it was reselected, so the
 * root element's `data-theme`/`class` is observed and the tokens re-read.
 *
 * Returns null before hydration so the first paint does not use a theme the
 * server could not know.
 */
export function useThemeTokens(): EmailThemeTokens | null {
  const [tokens, setTokens] = useState<EmailThemeTokens | null>(null);

  useEffect(() => {
    setTokens(readTokens());

    const root = document.documentElement;
    const observer = new MutationObserver(() => setTokens(readTokens()));
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    return () => observer.disconnect();
  }, []);

  return tokens;
}
