"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { themeMeta, DEFAULT_THEME } from "@/lib/themes";

/**
 * Quick light/dark flip. Remembers the last dark theme so toggling back from a
 * light theme returns you to it (not always plain "matrix").
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [lastDark, setLastDark] = useState(DEFAULT_THEME);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (theme && theme !== "custom" && !themeMeta(theme)?.light) setLastDark(theme);
  }, [theme]);

  if (!mounted) {
    return <div className="h-8 w-8" aria-hidden />;
  }

  const isLight = !!themeMeta(theme ?? DEFAULT_THEME)?.light;

  return (
    <button
      onClick={() => setTheme(isLight ? lastDark : "light")}
      className="h-8 w-8 grid place-items-center rounded-md text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
    >
      {isLight ? <Moon size={15} /> : <Sun size={15} />}
    </button>
  );
}
