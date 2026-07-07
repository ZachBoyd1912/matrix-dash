"use client";

import { useEffect, useState } from "react";
import { Activity, Database, Sparkles, Cpu, AlertCircle, Check, Coins } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

interface Diag {
  counts: Record<string, number>;
  dbSize: number;
  dbPath: string;
  ollama: { ok: boolean; version?: string; error?: string };
  embeddings: boolean;
  activeProvider: string | null;
  nodeVersion: string;
  platform: string;
}

interface CostBreakdown {
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
  messageCount: number;
}

interface UsageData {
  lifetime: CostBreakdown & { byProvider: (CostBreakdown & { providerKind: string })[] };
  month: CostBreakdown;
  today: CostBreakdown;
  topSessions: (CostBreakdown & { sessionId: string; sessionName: string })[];
}

function fmtSize(n: number) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function fmtCost(cost: number | null): string {
  if (cost === null) return "unknown";
  if (cost === 0) return "$0.00";
  return cost < 1 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export default function DiagnosticsPage() {
  const ref = useGsapEntrance();
  const [data, setData] = useState<Diag | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);

  useEffect(() => {
    fetch("/api/diagnostics")
      .then((r) => r.json())
      .then(setData);
    fetch("/api/usage")
      .then((r) => r.json())
      .then(setUsage);
  }, []);

  if (!data) return <div className="text-text-muted p-4 text-xs">Loading…</div>;

  return (
    <div ref={ref} className="space-y-8">
      <div className="relative overflow-hidden py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div
          className="orb top-0 left-48 h-40 w-40 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <Sparkles size={11} /> System health
          </span>
          <h1 className="display text-gradient mt-3 text-4xl md:text-5xl">Diagnostics</h1>
          <p className="text-text-secondary mt-2 text-sm">Health of every subsystem at a glance.</p>
        </div>
      </div>

      <Card interactive className="rounded-2xl">
        <p className="text-text-primary mb-3 flex items-center gap-2 text-xs font-semibold">
          <Activity size={13} /> Subsystems
        </p>
        <Row
          label="Active AI provider"
          value={data.activeProvider ?? "none"}
          ok={!!data.activeProvider}
        />
        <Row
          label="Embeddings"
          value={data.embeddings ? "available" : "no provider"}
          ok={data.embeddings}
        />
        <Row
          label="Ollama"
          value={data.ollama.ok ? `v${data.ollama.version}` : (data.ollama.error ?? "down")}
          ok={data.ollama.ok}
          optional
        />
      </Card>

      <Card interactive className="rounded-2xl">
        <p className="text-text-primary mb-3 flex items-center gap-2 text-xs font-semibold">
          <Database size={13} /> Local data
        </p>
        <Row label="Database size" value={fmtSize(data.dbSize)} ok={true} />
        <Row label="Database path" value={data.dbPath} ok={true} mono />
        {Object.entries(data.counts).map(([k, v]) => (
          <Row key={k} label={k} value={String(v)} ok={true} />
        ))}
      </Card>

      <Card interactive className="rounded-2xl">
        <p className="text-text-primary mb-3 flex items-center gap-2 text-xs font-semibold">
          <Cpu size={13} /> Runtime
        </p>
        <Row label="Node" value={data.nodeVersion} ok={true} mono />
        <Row label="Platform" value={data.platform} ok={true} mono />
      </Card>

      {usage && (
        <Card interactive className="rounded-2xl">
          <p className="text-text-primary mb-3 flex items-center gap-2 text-xs font-semibold">
            <Coins size={13} /> AI usage &amp; cost
          </p>
          <p className="text-text-muted mb-3 text-[11px]">
            Estimated from per-model/provider rates, not billing-accurate. Token totals are
            cumulative across every request (each turn re-sends prior context, which is real spend,
            not double-counting).
          </p>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <UsageStat label="Today" data={usage.today} />
            <UsageStat label="This month" data={usage.month} />
            <UsageStat label="Lifetime" data={usage.lifetime} />
          </div>

          {usage.lifetime.byProvider.length > 0 && (
            <div className="mb-4">
              <p className="text-text-secondary mb-1.5 text-[11px] font-medium">By provider</p>
              {usage.lifetime.byProvider.map((p) => (
                <div
                  key={p.providerKind}
                  className="flex items-center justify-between py-1 text-xs"
                >
                  <span className="text-text-secondary capitalize">{p.providerKind}</span>
                  <span className="text-text-primary font-mono text-[11px]">
                    {fmtCost(p.cost)} · {fmtTokens(p.inputTokens + p.outputTokens)} tok
                  </span>
                </div>
              ))}
            </div>
          )}

          {usage.topSessions.length > 0 && (
            <div>
              <p className="text-text-secondary mb-1.5 text-[11px] font-medium">Top sessions</p>
              {usage.topSessions.slice(0, 5).map((s) => (
                <div key={s.sessionId} className="flex items-center justify-between py-1 text-xs">
                  <span className="text-text-secondary truncate pr-2">{s.sessionName}</span>
                  <span className="text-text-primary shrink-0 font-mono text-[11px]">
                    {fmtCost(s.cost)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {usage.lifetime.messageCount === 0 && (
            <p className="text-text-muted text-xs">
              No usage tracked yet — this fills in as new chat turns complete.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function UsageStat({ label, data }: { label: string; data: CostBreakdown }) {
  return (
    <div className="rounded-lg border border-white/10 px-2.5 py-2 text-center">
      <div className="text-text-primary text-sm font-semibold">{fmtCost(data.cost)}</div>
      <div className="text-text-muted mt-0.5 text-[10px]">{label}</div>
      <div className="text-text-muted mt-1 text-[10px]">
        {fmtTokens(data.inputTokens + data.outputTokens)} tok
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  ok,
  optional,
  mono,
}: {
  label: string;
  value: string;
  ok: boolean;
  optional?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 text-xs">
      <span className="text-text-secondary capitalize">{label}</span>
      <span className="flex items-center gap-1.5">
        {ok ? (
          <Check size={11} className="text-emerald-400" />
        ) : (
          <AlertCircle size={11} className={optional ? "text-text-muted" : "text-rose-400"} />
        )}
        <span className={mono ? "text-text-primary font-mono text-[11px]" : "text-text-primary"}>
          {value}
        </span>
      </span>
    </div>
  );
}
