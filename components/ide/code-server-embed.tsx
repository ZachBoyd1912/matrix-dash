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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/5 bg-white/[0.01] px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <FolderOpen size={13} className="shrink-0 text-emerald-400" />
          <span className="truncate text-xs font-semibold text-emerald-400" title={folder}>
            {name}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={onRestart}
            disabled={busy}
            className="text-text-secondary hover:text-text-primary inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors hover:bg-white/5 disabled:pointer-events-none disabled:opacity-50"
            title="Restart VS Code server"
          >
            <RotateCw size={12} /> Restart
          </button>
          <button
            onClick={onStop}
            disabled={busy}
            className="text-text-secondary inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors hover:bg-white/5 hover:text-rose-400 disabled:pointer-events-none disabled:opacity-50"
            title="Stop VS Code server"
          >
            <Power size={12} /> Stop
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-secondary inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors hover:bg-white/5 hover:text-emerald-400"
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
        className="h-full w-full flex-1 border-0 bg-[#0a0a0a]"
      />
    </div>
  );
}
