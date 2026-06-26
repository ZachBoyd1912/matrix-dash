"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownToLine, Copy, Download, Trash2 } from "lucide-react";
import { fmtTime, type LogLine } from "@/lib/console/types";
import { LogLineRow } from "./log-line";
import { cn } from "@/lib/utils/cn";

interface Props {
  lines: LogLine[]; // already filtered by the page
  paused: boolean;
  query?: string;
  /** undefined for store-backed sources (no connection indicator). */
  connected?: boolean;
  emptyHint?: ReactNode;
  onClear: () => void;
  label: string; // for the download filename
}

function toText(lines: LogLine[]): string {
  return lines.map((l) => `${fmtTime(l.ts)} [${l.level.toUpperCase()}] ${l.text}`).join("\n");
}

/** A scrolling, auto-stick-to-bottom log pane with copy / download / clear. */
export function LogStreamView({ lines, paused, query, connected, emptyHint, onClear, label }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  // Freeze the displayed list while paused (snapshot at the moment of pausing).
  const [frozen, setFrozen] = useState<LogLine[] | null>(null);
  useEffect(() => {
    setFrozen(paused ? lines : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);
  const displayed = paused && frozen ? frozen : lines;

  useEffect(() => {
    if (paused || !stickRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [displayed, paused]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    stickRef.current = atBottom;
    setShowJump(!atBottom);
  };

  const jump = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickRef.current = true;
    setShowJump(false);
  };

  const copy = () => {
    void navigator.clipboard?.writeText(toText(displayed)).catch(() => {});
  };
  const download = () => {
    const blob = new Blob([toText(displayed)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* pane controls */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 bg-white/[0.01] shrink-0">
        {connected !== undefined && (
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              connected ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-text-muted"
            )}
            title={connected ? "Streaming" : "Disconnected"}
          />
        )}
        <span className="text-[10px] uppercase tracking-[0.18em] text-text-muted">
          {displayed.length} lines{paused && " · paused"}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={copy} title="Copy" className="grid h-6 w-6 place-items-center rounded text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors">
            <Copy size={12} />
          </button>
          <button onClick={download} title="Download .log" className="grid h-6 w-6 place-items-center rounded text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors">
            <Download size={12} />
          </button>
          <button onClick={onClear} title="Clear" className="grid h-6 w-6 place-items-center rounded text-text-muted hover:text-rose-400 hover:bg-white/5 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* log body */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto py-1.5 bg-[#080808]">
        {displayed.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center text-xs text-text-muted">
            {emptyHint ?? "No logs."}
          </div>
        ) : (
          displayed.map((line) => <LogLineRow key={line.id} line={line} query={query} />)
        )}
      </div>

      {showJump && (
        <button
          onClick={jump}
          className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full glass-strong text-[11px] text-text-secondary hover:text-emerald-400 border border-white/10 shadow-lg transition-colors"
        >
          <ArrowDownToLine size={12} /> Jump to bottom
        </button>
      )}
    </div>
  );
}
