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

/**
 * Readable plain text from an HTML email, for list previews, search and AI
 * summaries.
 *
 * Deliberately regex-based rather than DOMPurify. This is NOT a security
 * boundary — the result goes into a React text node, which escapes everything,
 * and the raw-HTML render path is `sanitizeEmailHtml` instead. Using DOMPurify
 * here was measured against the real 34,916-message mailbox: it spins up a
 * jsdom document per email, and repairing 3,765 messages took 292 seconds and
 * peaked at 1.9GB of heap. The VM this runs on has 955MB, so that was an
 * out-of-memory crash waiting to happen on the first page load after deploy.
 *
 * Tag-stripping alone is still not enough: it removes tags without replacing
 * them, so `<td>A</td><td>B</td>` becomes "AB" and a marketing email collapses
 * into one unreadable run of words. Block-level tags become newlines first, and
 * `<style>`/`<script>` blocks are dropped whole — otherwise a preview shows
 * hundreds of characters of CSS, the same class of bug as the raw
 * `<!doctype html>` that was leaking into the message list.
 */
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  middot: "\u00b7",
  bull: "\u2022",
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
  trade: "\u2122",
  reg: "\u00ae",
  copy: "\u00a9",
  euro: "\u20ac",
  pound: "\u00a3",
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const hex = code[1] === "x" || code[1] === "X";
      const n = hex ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

export function htmlToText(input: string): string {
  if (!input) return "";
  return (
    decodeEntities(
      input
        // Dropped outright — their CONTENT is code, not prose.
        .replace(/<(script|style|head|noscript|title)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|tr|li|h[1-6]|table|section|article|blockquote)>/gi, "\n")
        .replace(/<\/t[dh]>/gi, " ")
        // Everything else: drop the tag, keep the text between tags.
        .replace(/<[^>]*>/g, "")
    )
      // Collapse runs of spaces/tabs but never newlines — those carry structure.
      .replace(/[^\S\n]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .trim()
  );
}

/**
 * Does this look like an HTML document rather than plain text? Used to detect
 * rows written before the sync stored HTML separately, whose `body` column
 * holds raw markup.
 */
export function looksLikeHtml(input: string): boolean {
  const head = input.slice(0, 2000).trimStart().toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<!--")) return true;
  // Any well-formed opening tag, not a hand-picked list. The earlier version
  // matched only a handful of names, so a body opening with `<meta http-equiv`
  // — which is how a lot of real mail starts — was judged plain text and left
  // showing raw markup in the message list forever.
  //
  // The letter-first requirement is what keeps prose out: `<3`, `a < b` and a
  // quoted `<zach@example.com>` all fail, because a tag name must be followed
  // by whitespace or a closing bracket.
  return /<[a-z][a-z0-9-]*(\s|\/?>)/i.test(head);
}

/**
 * Sanitize a full HTML email body for rendering.
 *
 * Email is arbitrary attacker-controlled markup, so this is the security
 * boundary for the whole feature. It is deliberately far more permissive than
 * `sanitizeHtml` — real mail is table-based layout with inline styles, and
 * stripping that produces the unstyled wall of text this exists to fix — but
 * every script vector is removed: no <script>, no event handlers (DOMPurify
 * drops every on* attribute), no <iframe>/<object>/<embed>, no <form> that
 * could phish a submission, and `javascript:` URIs are rejected by DOMPurify's
 * own URI policy.
 *
 * The rendered output ALSO goes into a sandboxed iframe with scripting
 * disabled — this is defence in depth, not the only layer, because a sanitizer
 * bypass should not be a single point of failure.
 */
export function sanitizeEmailHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [
      "a",
      "b",
      "blockquote",
      "br",
      "caption",
      "center",
      "code",
      "col",
      "colgroup",
      "dd",
      "div",
      "dl",
      "dt",
      "em",
      "figcaption",
      "figure",
      "font",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "i",
      "img",
      "li",
      "ol",
      "p",
      "pre",
      "q",
      "s",
      "small",
      "span",
      "strike",
      "strong",
      "sub",
      "sup",
      "table",
      "tbody",
      "td",
      "tfoot",
      "th",
      "thead",
      "tr",
      "u",
      "ul",
      "wbr",
    ],
    ALLOWED_ATTR: [
      "align",
      "alt",
      "bgcolor",
      "border",
      "cellpadding",
      "cellspacing",
      "class",
      "color",
      "colspan",
      "dir",
      "face",
      "height",
      "href",
      "rowspan",
      "size",
      "src",
      "style",
      "target",
      "title",
      "valign",
      "width",
    ],
    // data: images are common in real mail (inline logos) and cannot execute;
    // cid: refers to an attachment part we do not fetch, so it simply fails to
    // load rather than reaching the network.
    ALLOWED_URI_REGEXP:
      /^(?:https?:|mailto:|tel:|cid:|data:image\/(?:png|jpe?g|gif|webp|bmp);base64,)/i,
    // Redundant today — ALLOWED_TAGS is an allowlist, so none of these could
    // survive anyway, and removing this line breaks no test. Kept as a
    // tripwire: the allowlist above is the sort of thing that gets widened to
    // "fix" a rendering complaint, and these must never come back with it.
    FORBID_TAGS: [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "link",
      "meta",
      "base",
    ],
    FORBID_ATTR: ["srcset", "formaction", "ping", "background"],
  });
}
