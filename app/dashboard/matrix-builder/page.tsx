"use client";

import { useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";

// Matrix Builder = a separate app (a customized bolt.new fork: a full-screen,
// in-browser AI IDE) that runs locally on its own dev server. We embed it as-is
// in an iframe; we do not port or modify it. Override with an env var if the user
// runs it on a different host/port.
const BUILDER_URL =
  process.env.NEXT_PUBLIC_MATRIX_BUILDER_URL ?? "http://localhost:5001";

export default function MatrixBuilderPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Arm the explicit-anonymous iframe. Harmless under COEP: require-corp, and
    // required if the host ever falls back to COEP: credentialless. React does
    // not render this boolean attribute, so set it imperatively via the ref.
    iframeRef.current?.setAttribute("credentialless", "");

    // The embedded WebContainer needs SharedArrayBuffer, which the browser only
    // grants when this host document is cross-origin isolated. The scoped
    // COOP/COEP headers only take effect on a *full* document load — Next.js
    // soft-navigation from another sidebar route does not re-apply them, so we'd
    // land here with crossOriginIsolated === false. Force one hard reload to
    // re-fetch this document with its headers. The session guard prevents a
    // reload loop if the headers are genuinely missing/misconfigured.
    const RELOAD_GUARD = "matrixBuilderCoiReload";
    if (window.crossOriginIsolated) {
      sessionStorage.removeItem(RELOAD_GUARD);
      return;
    }
    if (!sessionStorage.getItem(RELOAD_GUARD)) {
      sessionStorage.setItem(RELOAD_GUARD, "1");
      window.location.reload();
    }
  }, []);

  return (
    <div className="page-h relative flex flex-col min-h-0">
      <iframe
        ref={iframeRef}
        src={BUILDER_URL}
        title="Matrix Builder"
        allow="cross-origin-isolated; clipboard-read; clipboard-write"
        className="w-full h-full flex-1 border-0 block bg-[#0a0a0a]"
      />
      <a
        href={BUILDER_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-2.5 right-3 inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full glass-input text-[11px] text-text-secondary hover:text-emerald-400 hover:border-white/15 transition-colors"
      >
        <ExternalLink size={12} /> Open in new tab
      </a>
    </div>
  );
}
