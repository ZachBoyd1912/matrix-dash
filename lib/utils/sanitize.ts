import DOMPurify from "isomorphic-dompurify";

/**
 * Strips all HTML/script content, leaving plain text. The app has no current
 * dangerouslySetInnerHTML or rehype-raw sink — content renders through
 * react-markdown, which is safe by default — so nothing calls this yet. It's
 * here for the next feature that accepts externally-sourced HTML (email
 * bodies, imported notes, webhook payloads) before it goes anywhere near a
 * raw-HTML render path.
 */
export function stripHtml(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/** Allows a minimal safe subset of formatting tags (for rendering trusted-ish rich text as HTML). */
export function sanitizeHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "p", "br", "ul", "ol", "li", "code", "pre"],
    ALLOWED_ATTR: ["href"],
  });
}
