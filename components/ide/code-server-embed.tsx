"use client";

import { ExternalLink, FolderOpen, Power, RotateCw } from "lucide-react";

interface Props {
  /** Base URL of the running code-server, e.g. "http://127.0.0.1:3010". */
  url: string;
  /** Absolute folder path the server opened. */
  folder: string;
  /** Display name for the workspace (folder basename). */
  name: string;
  onStop: () => void;
  onRestart: () => void;
  /** Disables the toolbar actions while a stop/restart request is in flight. */
  busy?: boolean;
}

/**
 * Renders the running code-server in an iframe with a slim toolbar above it.
 * The iframe src points at the server's folder route; an "Open in new tab" link
 * is always shown as a framing fallback in case the server refuses to be embedded.
 */
export function CodeServerEmbed({ url, folder, name, onStop, onRestart, busy }: Props) {
  const iframeSrc = `${url}/?folder=${encodeURIComponent(folder)}`;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/5 bg-white/[0.01] shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <FolderOpen size={13} className="text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold text-emerald-400 truncate" title={folder}>
            {name}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onRestart}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-2 h-7 rounded-md text-[11px] text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            title="Restart VS Code server"
          >
            <RotateCw size={12} /> Restart
          </button>
          <button
            onClick={onStop}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-2 h-7 rounded-md text-[11px] text-text-secondary hover:text-rose-400 hover:bg-white/5 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            title="Stop VS Code server"
          >
            <Power size={12} /> Stop
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2 h-7 rounded-md text-[11px] text-text-secondary hover:text-emerald-400 hover:bg-white/5 transition-colors"
            title="Open VS Code in a new browser tab"
          >
            <ExternalLink size={12} /> Open in new tab
          </a>
        </div>
      </div>

      <iframe
        key={iframeSrc}
        src={iframeSrc}
        title="Matrix Dash IDE"
        allow="clipboard-read; clipboard-write"
        className="w-full h-full border-0 bg-[#0a0a0a] flex-1"
      />
    </div>
  );
}
