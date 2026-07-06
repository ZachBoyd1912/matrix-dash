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
export function LogStreamView({
  lines,
  paused,
  query,
  connected,
  emptyHint,
  onClear,
  label,
}: Props) {
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
      <div className="flex shrink-0 items-center gap-2 border-b border-white/5 bg-white/[0.01] px-3 py-1.5">
        {connected !== undefined && (
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              connected ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-text-muted"
            )}
            title={connected ? "Streaming" : "Disconnected"}
          />
        )}
        <span className="text-text-muted text-[10px] tracking-[0.18em] uppercase">
          {displayed.length} lines{paused && " · paused"}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={copy}
            title="Copy"
            className="text-text-muted hover:text-text-primary grid h-6 w-6 place-items-center rounded transition-colors hover:bg-white/5"
          >
            <Copy size={12} />
          </button>
          <button
            onClick={download}
            title="Download .log"
            className="text-text-muted hover:text-text-primary grid h-6 w-6 place-items-center rounded transition-colors hover:bg-white/5"
          >
            <Download size={12} />
          </button>
          <button
            onClick={onClear}
            title="Clear"
            className="text-text-muted grid h-6 w-6 place-items-center rounded transition-colors hover:bg-white/5 hover:text-rose-400"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* log body */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto bg-[#080808] py-1.5"
      >
        {displayed.length === 0 ? (
          <div className="text-text-muted grid h-full place-items-center px-6 text-center text-xs">
            {emptyHint ?? "No logs."}
          </div>
        ) : (
          displayed.map((line) => <LogLineRow key={line.id} line={line} query={query} />)
        )}
      </div>

      {showJump && (
        <button
          onClick={jump}
          className="glass-strong text-text-secondary absolute right-3 bottom-3 inline-flex h-7 items-center gap-1.5 rounded-full border border-white/10 px-2.5 text-[11px] shadow-lg transition-colors hover:text-emerald-400"
        >
          <ArrowDownToLine size={12} /> Jump to bottom
        </button>
      )}
    </div>
  );
}
