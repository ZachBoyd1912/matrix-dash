/**
 * Named theme registry — display metadata for the appearance picker.
 *
 * The authoritative token values live in `app/globals.css` under
 * `:root[data-theme="<id>"]` blocks; this list only carries the few swatch
 * colors the grid needs plus the light/dark flag. Keep the ids in sync.
 *
 * Theme names + palette direction are inspired by Odysseus
 * (pewdiepie-archdaemon, AGPL-3.0). Re-implemented clean-room in CSS.
 */

export interface ThemeMeta {
  id: string;
  label: string;
  bg: string;
  surface: string;
  accent: string;
  light?: boolean;
}

export const THEMES: ThemeMeta[] = [
  { id: "matrix", label: "Matrix", bg: "#050505", surface: "#0d0d0d", accent: "#34d399" },
  { id: "claude", label: "Claude", bg: "#141414", surface: "#1c1c1c", accent: "#d97706" },
  { id: "original", label: "Original", bg: "#1a1a2e", surface: "#232342", accent: "#7c6af0" },
  { id: "midnight", label: "Midnight", bg: "#050507", surface: "#0d0d12", accent: "#60a5fa" },
  { id: "cyberpunk", label: "Cyberpunk", bg: "#0a0a0f", surface: "#12121c", accent: "#00ffcc" },
  { id: "retrowave", label: "Retrowave", bg: "#0d0221", surface: "#160a30", accent: "#ff2d78" },
  { id: "forest", label: "Forest", bg: "#0a1a0f", surface: "#102516", accent: "#4ade80" },
  { id: "ocean", label: "Ocean", bg: "#051218", surface: "#0a1c24", accent: "#38bdf8" },
  { id: "ume", label: "Ume", bg: "#1a0826", surface: "#260f35", accent: "#e879f9" },
  { id: "copper", label: "Copper", bg: "#1a0e08", surface: "#261610", accent: "#c2652a" },
  { id: "terminal", label: "Terminal", bg: "#000000", surface: "#0a0a0a", accent: "#22c55e" },
  { id: "lavender", label: "Lavender", bg: "#1a1528", surface: "#241d38", accent: "#a78bfa" },
  { id: "cute", label: "Cute", bg: "#1f0a1f", surface: "#2c0f2c", accent: "#f472b6" },
  { id: "gpt", label: "GPT", bg: "#0d0d0d", surface: "#161616", accent: "#9ca3af" },
  { id: "paper", label: "Paper", bg: "#f5f0e8", surface: "#fffdf8", accent: "#b45309", light: true },
  { id: "light", label: "Light", bg: "#f8f8f8", surface: "#ffffff", accent: "#34d399", light: true },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME = "matrix";

export function themeMeta(id: string): ThemeMeta | undefined {
  return THEMES.find((t) => t.id === id);
}

/** Editable custom-theme token set (used by the Customize tab). */
export interface CustomTheme {
  bgBase: string;
  bgSurface: string;
  bgElevated: string;
  bgOverlay: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
}

export const DEFAULT_CUSTOM: CustomTheme = {
  bgBase: "#050505",
  bgSurface: "#0d0d0d",
  bgElevated: "#141414",
  bgOverlay: "#1a1a1a",
  textPrimary: "#e8e8e8",
  textSecondary: "#888888",
  textMuted: "#555555",
  accent: "#34d399",
};

/** Map a CustomTheme to the CSS variable declarations for `[data-theme="custom"]`. */
export function customThemeToCss(c: CustomTheme): string {
  return `:root[data-theme="custom"]{
  --color-bg-base:${c.bgBase};
  --color-bg-surface:${c.bgSurface};
  --color-bg-elevated:${c.bgElevated};
  --color-bg-overlay:${c.bgOverlay};
  --color-text-primary:${c.textPrimary};
  --color-text-secondary:${c.textSecondary};
  --color-text-muted:${c.textMuted};
  --color-emerald-accent:${c.accent};
}`;
}

// ─── Color harmony generator ──────────────────────────────────────────────
// Derive a full palette from one accent + a harmony rule. Used by Customize.

function hexToHsl(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, s, l];
}

function hslToHex(hh: number, ss: number, ll: number): string {
  const h = ((hh % 360) + 360) % 360;
  const s = Math.min(1, Math.max(0, ss));
  const l = Math.min(1, Math.max(0, ll));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export type Harmony = "complementary" | "analogous" | "triadic" | "split";

/** Generate a full token set from an accent + harmony rule + light/dark mode. */
export function generateHarmony(accent: string, harmony: Harmony, mode: "dark" | "light"): CustomTheme {
  const [h, s] = hexToHsl(accent);
  // Secondary hue depends on the harmony rule (used to tint the surfaces).
  const shift =
    harmony === "complementary" ? 180 : harmony === "triadic" ? 120 : harmony === "split" ? 150 : 30;
  const baseHue = (h + shift) % 360;
  const sat = Math.min(0.5, Math.max(0.12, s * 0.4));

  if (mode === "light") {
    return {
      bgBase: hslToHex(baseHue, sat * 0.5, 0.96),
      bgSurface: hslToHex(baseHue, sat * 0.4, 0.99),
      bgElevated: hslToHex(baseHue, sat * 0.3, 1.0),
      bgOverlay: hslToHex(baseHue, sat * 0.5, 0.92),
      textPrimary: hslToHex(baseHue, 0.2, 0.12),
      textSecondary: hslToHex(baseHue, 0.12, 0.4),
      textMuted: hslToHex(baseHue, 0.1, 0.6),
      accent,
    };
  }
  return {
    bgBase: hslToHex(baseHue, sat, 0.04),
    bgSurface: hslToHex(baseHue, sat, 0.08),
    bgElevated: hslToHex(baseHue, sat, 0.12),
    bgOverlay: hslToHex(baseHue, sat, 0.16),
    textPrimary: hslToHex(baseHue, 0.15, 0.92),
    textSecondary: hslToHex(baseHue, 0.12, 0.6),
    textMuted: hslToHex(baseHue, 0.1, 0.4),
    accent,
  };
}
