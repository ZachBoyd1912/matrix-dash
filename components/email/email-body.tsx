"use client";

import { useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, Loader2, ShieldCheck } from "lucide-react";
import { buildDocumentCss, classifyEmailPaint, NEUTRAL_TOKENS } from "@/lib/utils/email-theme";
import { useThemeTokens } from "@/lib/hooks/use-theme-tokens";

interface Props {
  /** Sanitized server-side; null for genuinely plain-text mail. */
  html: string | null | undefined;
  /** Plain-text fallback, shown when there is no HTML alternative. */
  text: string;
  /** True while the HTML for an older message is being refetched from Gmail. */
  loading?: boolean;
}

/** Replacement for a blocked remote image: a 1x1 transparent GIF. */
const BLANK_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * Neutralise images that would hit the network, leaving inline ones alone.
 *
 * A remote image in mail is usually a tracking pixel: loading it tells the
 * sender the exact moment the message was opened, and from which IP address.
 * Gmail hides that by proxying every image through Google's servers — Matrix
 * Dash has no proxy, so the request goes straight from this machine to the
 * sender. `data:` and `cid:` images are untouched: they are already embedded
 * and reach nobody.
 */
export function blockRemoteImages(html: string): { html: string; blocked: number } {
  let blocked = 0;
  const stripped = html.replace(/<img\b[^>]*>/gi, (tag) => {
    if (!/\ssrc\s*=/i.test(tag)) return tag;
    if (/\ssrc\s*=\s*["']?(?:data:|cid:)/i.test(tag)) return tag;
    blocked++;
    return tag.replace(/\ssrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, ` src="${BLANK_PIXEL}"`);
  });
  return { html: stripped, blocked };
}

/**
 * Renders an email body the way a mail client does.
 *
 * The markup goes into a sandboxed iframe rather than `dangerouslySetInnerHTML`,
 * for two independent reasons:
 *
 * 1. **Isolation.** `sandbox` without `allow-scripts` means nothing in the
 *    message can execute — the second layer beneath server-side sanitizing, so
 *    a single sanitizer bypass is not game over. `allow-same-origin` is
 *    deliberately absent: pairing it with a document you did not author is the
 *    documented footgun, and the frame has no legitimate need for this origin.
 * 2. **Style containment.** Email CSS is written for the 1990s — global
 *    selectors, `!important`, table resets. Injected into the page it would
 *    bleed into the dashboard's own styling. A separate document cannot.
 *
 * The frame fills the reading pane and scrolls internally, which is what Gmail
 * does; auto-sizing to content would need scripting inside the frame, exactly
 * what the sandbox exists to prevent.
 */
export function EmailBody({ html, text, loading }: Props) {
  const [showImages, setShowImages] = useState(false);
  const tokens = useThemeTokens();

  // Re-blocking on every message is the point of the default; leaving it on
  // would silently opt the next sender in.
  useEffect(() => setShowImages(false), [html]);

  const { srcDoc, blocked, frameBg } = useMemo(() => {
    if (!html) return { srcDoc: null, blocked: 0, frameBg: null };

    const { html: processed, blocked } = showImages
      ? { html, blocked: 0 }
      : blockRemoteImages(html);

    // How much of the appearance we may decide — see classifyEmailPaint.
    const paint = classifyEmailPaint(html);
    const active = tokens ?? NEUTRAL_TOKENS;
    const css = buildDocumentCss(active, paint);
    // The frame itself matches whatever the document will paint behind the
    // message, so there is no flash of the wrong colour before it loads.
    const frameBg = paint === "assumes-white" ? NEUTRAL_TOKENS.background : active.background;

    // `<base target="_blank">` makes every link open in a new tab. Without it a
    // click tries to navigate the frame itself, which the sandbox blocks — so
    // the link would simply appear dead.
    return {
      srcDoc: `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>${css}</style></head><body>${processed}</body></html>`,
      blocked,
      frameBg,
    };
  }, [html, showImages, tokens]);

  if (loading && !srcDoc) {
    return (
      <div className="text-text-muted flex items-center gap-2 text-xs">
        <Loader2 size={13} className="animate-spin" />
        Fetching the full message from Gmail…
      </div>
    );
  }

  if (!srcDoc) {
    return (
      <p className="text-text-primary/90 max-w-2xl text-sm leading-7 whitespace-pre-wrap">{text}</p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!showImages && blocked > 0 && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-400/15 bg-amber-400/[0.06] px-2.5 py-1.5 text-[11px] text-amber-300/90">
          <ShieldCheck size={12} className="shrink-0" />
          <span className="flex-1">
            {blocked} remote image{blocked === 1 ? "" : "s"} blocked — loading them tells the sender
            you opened this.
          </span>
          <button
            onClick={() => setShowImages(true)}
            className="text-text-primary inline-flex shrink-0 items-center gap-1 rounded border border-white/10 px-2 py-0.5 transition-colors hover:bg-white/10"
          >
            <ImageIcon size={11} /> Show images
          </button>
        </div>
      )}
      <iframe
        // Remounting on a content change keeps the previous message from
        // lingering in the frame while the new one paints.
        key={`${srcDoc.length}-${showImages}-${frameBg ?? ""}`}
        srcDoc={srcDoc}
        title="Message body"
        // No allow-scripts, no allow-same-origin. allow-popups is what lets a
        // link open in a new tab; without it every link in the mail is inert.
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="min-h-0 w-full flex-1 rounded-lg border border-white/5"
        style={{ background: frameBg ?? NEUTRAL_TOKENS.background }}
      />
    </div>
  );
}
