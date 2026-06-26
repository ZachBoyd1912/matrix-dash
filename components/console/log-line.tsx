import type { ReactNode } from "react";
import { fmtTime, levelColor, type LogLine } from "@/lib/console/types";
import { cn } from "@/lib/utils/cn";

function Highlighted({ text, query }: { text: string; query?: string }) {
  const q = query?.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let key = 0;
  for (;;) {
    const at = lower.indexOf(ql, from);
    if (at === -1) {
      parts.push(text.slice(from));
      break;
    }
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={key++} className="rounded-sm bg-emerald-400/30 text-text-primary">
        {text.slice(at, at + q.length)}
      </mark>
    );
    from = at + q.length;
  }
  return <>{parts}</>;
}

/** One prettified, monospace log row: time · level · message. */
export function LogLineRow({ line, query }: { line: LogLine; query?: string }) {
  return (
    <div className="flex gap-2 px-3 py-[1px] font-mono text-[11px] leading-relaxed hover:bg-white/[0.025]">
      <span className="shrink-0 tabular-nums text-text-muted">{fmtTime(line.ts)}</span>
      <span className={cn("w-[42px] shrink-0 font-semibold uppercase", levelColor(line.level))}>
        {line.level}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-words text-text-secondary">
        <Highlighted text={line.text} query={query} />
      </span>
    </div>
  );
}
