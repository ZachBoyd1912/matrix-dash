/**
 * Whether an email brings its own colour scheme.
 *
 * This decides how the message document is painted, and the choice is forced
 * by a real conflict:
 *
 * - A **designed** email (marketing, receipts, anything with a template) sets
 *   its own backgrounds and text colours. Re-colouring it produces the classic
 *   dark-mode email failure — logos on transparent backgrounds disappear,
 *   branded buttons lose contrast, and images keep their own light backgrounds
 *   regardless. Gmail does not attempt it, and neither do we: those render
 *   exactly as sent, which is what "looks identical to Gmail" means.
 *
 * - A **plain** email — a bare `<p>`/`<div>` body with no styling, which is
 *   most personal mail and most transactional notifications — has no opinion.
 *   Painting that with the dashboard's own theme is what makes the reading pane
 *   feel like part of the app rather than a white box pasted into it.
 *
 * Getting this backwards is not cosmetic: an email that sets dark text but no
 * background, rendered on a dark themed surface, is invisible.
 */
export function hasOwnColorScheme(html: string): boolean {
  // Only the opening stretch matters — a template declares its palette in the
  // wrapper table, and scanning 400KB of markup on every render is wasteful.
  const head = html.slice(0, 20_000).toLowerCase();
  return (
    head.includes("bgcolor=") ||
    head.includes("background-color:") ||
    head.includes("background:#") ||
    head.includes("background: #") ||
    /(?:^|[;"'\s])color\s*:/.test(head)
  );
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
export function buildDocumentCss(t: EmailThemeTokens, themed: boolean): string {
  return `
  :root { color-scheme: ${themed ? "dark light" : "light"}; }
  html, body { margin: 0; padding: 0; background: ${t.background}; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 14px; line-height: 1.6; color: ${t.text};
    padding: 16px; word-break: break-word; overflow-wrap: anywhere;
  }
  a { color: ${t.link}; text-decoration: underline; }
  img { max-width: 100%; height: auto; border: 0; }
  table { max-width: 100%; }
  hr { border: 0; border-top: 1px solid ${t.border}; }
  blockquote {
    margin: 0 0 0 8px; padding-left: 12px;
    border-left: 2px solid ${t.border}; color: ${t.muted};
  }
  pre { white-space: pre-wrap; word-wrap: break-word; }
  ::selection { background: ${t.link}33; }
`;
}
