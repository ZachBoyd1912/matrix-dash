"use client";

import { useMemo, useState } from "react";
import { Blocks, LayoutDashboard, Pause, Play, Search, Trash2 } from "lucide-react";
import { useLogStream } from "@/lib/hooks/use-log-stream";
import { useLogStore } from "@/lib/stores/use-log-store";
import { LEVELS, levelColor, type LogLevel, type LogLine } from "@/lib/console/types";
import { LogStreamView } from "./log-stream-view";
import { cn } from "@/lib/utils/cn";

type DashTab = "dash-server" | "dash-browser";
type BuilderTab = "builder-server" | "builder-browser";

function Segmented<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: ReadonlyArray<readonly [T, string]>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-white/[0.04] p-0.5">
      {tabs.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            "h-6 rounded-md px-2.5 text-[11px] font-medium transition-colors",
            value === v
              ? "text-text-primary bg-white/10"
              : "text-text-muted hover:text-text-secondary"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function BridgeHint() {
  return (
    <div className="max-w-xs space-y-1.5">
      <p>No app-console output yet.</p>
      <p className="text-text-muted">
        Capturing the embedded app&apos;s browser console needs a small{" "}
        <code className="text-text-secondary font-mono">postMessage</code> bridge added inside the
        Matrix Builder app (it&apos;s cross-origin, so it can&apos;t be read from here directly).
        Once that bridge is added, its logs appear here automatically.
      </p>
    </div>
  );
}

export default function ConsolePage() {
  const dashServer = useLogStream("/api/console/server");
  const builderServer = useLogStream("/api/matrix-builder/logs");
  const dashBrowser = useLogStore((s) => s.dashBrowser);
  const builderBrowser = useLogStore((s) => s.builderBrowser);
  const bridgeSeen = useLogStore((s) => s.builderBridgeSeen);
  const clearStore = useLogStore((s) => s.clear);

  const [query, setQuery] = useState("");
  const [levels, setLevels] = useState<Set<LogLevel>>(() => new Set(LEVELS));
  const [paused, setPaused] = useState(false);
  const [dashTab, setDashTab] = useState<DashTab>("dash-server");
  const [builderTab, setBuilderTab] = useState<BuilderTab>("builder-server");

  const filterFn = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (lines: LogLine[]) =>
      lines.filter((l) => levels.has(l.level) && (!q || l.text.toLowerCase().includes(q)));
  }, [query, levels]);

  const toggleLevel = (lv: LogLevel) =>
    setLevels((prev) => {
      const n = new Set(prev);
      if (n.has(lv)) n.delete(lv);
      else n.add(lv);
      return n;
    });

  const clearServer = async (which: "dash" | "builder") => {
    const url = which === "dash" ? "/api/console/server" : "/api/matrix-builder/logs";
    try {
      await fetch(url, { method: "DELETE" });
    } catch {
      /* ignore */
    }
    if (which === "dash") dashServer.clear();
    else builderServer.clear();
  };

  const clearAll = () => {
    void clearServer("dash");
    void clearServer("builder");
    clearStore("dash-browser");
    clearStore("builder-browser");
  };

  const dashLines = dashTab === "dash-server" ? dashServer.lines : dashBrowser;
  const builderLines = builderTab === "builder-server" ? builderServer.lines : builderBrowser;

  return (
    <div className="page-h flex min-h-0 flex-col">
      {/* Global toolbar */}
      <div className="glass-strong flex shrink-0 flex-wrap items-center gap-2.5 border-b border-white/5 px-4 py-2.5">
        <div className="relative">
          <Search
            size={13}
            className="text-text-muted absolute top-1/2 left-2.5 -translate-y-1/2"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter logs…"
            className="glass-input text-text-primary h-8 w-52 rounded-lg pr-3 pl-8 text-xs"
          />
        </div>

        <div className="flex items-center gap-1">
          {LEVELS.map((lv) => {
            const on = levels.has(lv);
            return (
              <button
                key={lv}
                onClick={() => toggleLevel(lv)}
                className={cn(
                  "h-7 rounded-md border px-2 text-[10px] font-semibold uppercase transition-colors",
                  on
                    ? cn("border-white/15 bg-white/5", levelColor(lv))
                    : "text-text-muted hover:text-text-secondary border-transparent"
                )}
              >
                {lv}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setPaused((p) => !p)}
            className="glass-input text-text-secondary hover:text-text-primary inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors hover:border-white/15"
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={clearAll}
            className="glass-input text-text-secondary inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors hover:border-white/15 hover:text-rose-400"
          >
            <Trash2 size={13} /> Clear all
          </button>
        </div>
      </div>

      {/* Two clearly-divided project sections */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        {/* Matrix Dashboard */}
        <section className="flex min-h-0 flex-col border-b border-white/5 lg:border-r lg:border-b-0">
          <header className="flex shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2">
            <LayoutDashboard size={13} className="text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-400">Matrix Dashboard</span>
            <div className="ml-auto">
              <Segmented<DashTab>
                tabs={[
                  ["dash-server", "Backend"],
                  ["dash-browser", "Browser"],
                ]}
                value={dashTab}
                onChange={setDashTab}
              />
            </div>
          </header>
          <LogStreamView
            lines={filterFn(dashLines)}
            paused={paused}
            query={query}
            connected={dashTab === "dash-server" ? dashServer.connected : undefined}
            onClear={
              dashTab === "dash-server"
                ? () => clearServer("dash")
                : () => clearStore("dash-browser")
            }
            label={dashTab}
            emptyHint={
              dashTab === "dash-browser"
                ? "No browser console output yet."
                : "Waiting for backend output…"
            }
          />
        </section>

        {/* Matrix Builder */}
        <section className="flex min-h-0 flex-col">
          <header className="flex shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2">
            <Blocks size={13} className="text-violet-400" />
            <span className="text-xs font-semibold text-violet-400">Matrix Builder</span>
            <div className="ml-auto">
              <Segmented<BuilderTab>
                tabs={[
                  ["builder-server", "Dev server"],
                  ["builder-browser", "App console"],
                ]}
                value={builderTab}
                onChange={setBuilderTab}
              />
            </div>
          </header>
          <LogStreamView
            lines={filterFn(builderLines)}
            paused={paused}
            query={query}
            connected={builderTab === "builder-server" ? builderServer.connected : undefined}
            onClear={
              builderTab === "builder-server"
                ? () => clearServer("builder")
                : () => clearStore("builder-browser")
            }
            label={builderTab}
            emptyHint={
              builderTab === "builder-browser" ? (
                bridgeSeen ? (
                  "No app console output yet."
                ) : (
                  <BridgeHint />
                )
              ) : (
                "Start Matrix Builder to see dev-server logs."
              )
            }
          />
        </section>
      </div>
    </div>
  );
}
