export type EmailPaint =
  /** The sender paints its own background; only the surround is themed. */
  | "own-background"
  /** Text colours but no background — it assumes white, so give it white. */
  | "assumes-white"
  /** No opinion at all; paint it entirely in the dashboard's theme. */
  | "themed";

/**
 * How much of an email's appearance we are allowed to decide.
 *
 * A three-way split, because the two-way one produces a visible defect at each
 * extreme:
 *
 * - **own-background** — a designed template (marketing, receipts) sets its own
 *   backgrounds. Recolouring it is the classic dark-mode email failure: logos
 *   on transparent backgrounds vanish and branded buttons lose contrast. Its
 *   content is left exactly as sent, but the padding AROUND it follows the
 *   dashboard theme — painting that white frames a dark email in a white
 *   border, which is what "not themed" looks like.
 *
 * - **assumes-white** — sets text colours but no background. This is the
 *   dangerous one: themed onto a dark surface, dark text becomes invisible. It
 *   gets the white background it was written against.
 *
 * - **themed** — a bare `<p>`/`<div>` body, which is most personal and
 *   transactional mail. No opinion to preserve, so it is painted entirely in
 *   the dashboard's own colours and follows theme changes.
 */
export function classifyEmailPaint(html: string): EmailPaint {
  // Only the opening stretch matters — a template declares its palette in the
  // wrapper — and scanning 400KB on every render is wasteful.
  const head = html.slice(0, 20_000).toLowerCase();
  const hasBackground =
    head.includes("bgcolor=") ||
    head.includes("background-color:") ||
    /background\s*:\s*(#|rgb|hsl|linear-gradient)/.test(head);
  if (hasBackground) return "own-background";
  return /(?:^|[;"'\s])color\s*:/.test(head) ? "assumes-white" : "themed";
}

export interface EmailThemeTokens {
  background: string;
  text: string;
  muted: string;
  link: string;
  border: string;
}

/** Sensible values for SSR and for a document that brings its own palette. */
export const NEUTRAL_TOKENS: EmailThemeTokens = {
  background: "#ffffff",
  text: "#202124",
  muted: "#5f6368",
  link: "#1a73e8",
  border: "#dadce0",
};

/**
 * Base stylesheet for the message document.
 *
 * Deliberately minimal. Real mail carries its own layout, and imposing a design
 * system on it is how a message ends up looking nothing like it does in every
 * other client. Only the things a bare document gets wrong are set: readable
 * defaults, no horizontal overflow, and links that look like links.
 */
export function buildDocumentCss(t: EmailThemeTokens, paint: EmailPaint): string {
  const themed = paint === "themed";
  // `own-background` keeps the sender's content untouched but themes the
  // surround, so a dark email is not framed in a white border.
  const surround = paint === "assumes-white" ? NEUTRAL_TOKENS.background : t.background;
  const bodyBg = paint === "own-background" ? "transparent" : surround;
  const textColor = paint === "assumes-white" ? NEUTRAL_TOKENS.text : t.text;
  const linkColor = paint === "assumes-white" ? NEUTRAL_TOKENS.link : t.link;
  const borderColor = paint === "assumes-white" ? NEUTRAL_TOKENS.border : t.border;

  return `
  :root { color-scheme: ${themed ? "dark light" : "light"}; }
  html { margin: 0; padding: 0; background: ${surround}; }
  body { margin: 0; background: ${bodyBg}; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 14px; line-height: 1.6; ${paint === "own-background" ? "" : `color: ${textColor};`}
    padding: ${paint === "own-background" ? "0" : "16px"};
    word-break: break-word; overflow-wrap: anywhere;
  }
  a { color: ${linkColor}; text-decoration: underline; }
  img { max-width: 100%; height: auto; border: 0; }
  table { max-width: 100%; }
  hr { border: 0; border-top: 1px solid ${borderColor}; }
  blockquote {
    margin: 0 0 0 8px; padding-left: 12px;
    border-left: 2px solid ${borderColor}; color: ${t.muted};
  }
  pre { white-space: pre-wrap; word-wrap: break-word; }
`;
}
