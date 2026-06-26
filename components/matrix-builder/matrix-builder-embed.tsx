"use client";

import { useEffect, useRef } from "react";
import { Blocks, ExternalLink, Power, RotateCw } from "lucide-react";

interface Props {
  /** URL of the running Matrix Builder dev server, e.g. "http://localhost:5001". */
  url: string;
  onStop: () => void;
  onRestart: () => void;
  /** Disables the toolbar actions while a stop/restart request is in flight. */
  busy?: boolean;
}

/**
 * Renders the running Matrix Builder app in a cross-origin-isolated iframe with a
 * slim toolbar above it. The host route is isolated via scoped COOP/COEP headers
 * (next.config.ts) and delegates isolation to this frame via
 * allow="cross-origin-isolated" so the embedded WebContainer can boot. An
 * "Open in new tab" link is always shown as a framing fallback.
 */
export function MatrixBuilderEmbed({ url, onStop, onRestart, busy }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Explicit anonymous iframe. Harmless under COEP: require-corp; required if
    // the host ever falls back to COEP: credentialless. React won't render this
    // boolean attribute, so set it imperatively via the ref.
    iframeRef.current?.setAttribute("credentialless", "");
  }, []);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/5 bg-white/[0.01] shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Blocks size={13} className="text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold text-emerald-400 truncate">Matrix Builder</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onRestart}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-2 h-7 rounded-md text-[11px] text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            title="Restart the Matrix Builder dev server"
          >
            <RotateCw size={12} /> Restart
          </button>
          <button
            onClick={onStop}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-2 h-7 rounded-md text-[11px] text-text-secondary hover:text-rose-400 hover:bg-white/5 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            title="Stop the Matrix Builder dev server"
          >
            <Power size={12} /> Stop
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2 h-7 rounded-md text-[11px] text-text-secondary hover:text-emerald-400 hover:bg-white/5 transition-colors"
            title="Open Matrix Builder in a new browser tab"
          >
            <ExternalLink size={12} /> Open in new tab
          </a>
        </div>
      </div>

      <iframe
        ref={iframeRef}
        src={url}
        title="Matrix Builder"
        allow="cross-origin-isolated; clipboard-read; clipboard-write"
        className="w-full h-full border-0 bg-[#0a0a0a] flex-1"
      />
    </div>
  );
}
