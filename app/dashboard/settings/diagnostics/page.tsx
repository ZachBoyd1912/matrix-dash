"use client";

import { useEffect, useState } from "react";
import { Activity, Database, Sparkles, Cpu, AlertCircle, Check } from "lucide-react";
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

function fmtSize(n: number) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export default function DiagnosticsPage() {
  const ref = useGsapEntrance();
  const [data, setData] = useState<Diag | null>(null);

  useEffect(() => {
    fetch("/api/diagnostics").then((r) => r.json()).then(setData);
  }, []);

  if (!data) return <div className="p-4 text-xs text-text-muted">Loading…</div>;

  return (
    <div ref={ref} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Diagnostics</h2>
        <p className="text-text-secondary text-sm mt-1">Health of every subsystem at a glance.</p>
      </div>

      <Card>
        <p className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Activity size={13} /> Subsystems
        </p>
        <Row label="Active AI provider" value={data.activeProvider ?? "none"} ok={!!data.activeProvider} />
        <Row label="Embeddings" value={data.embeddings ? "available" : "no provider"} ok={data.embeddings} />
        <Row label="Ollama" value={data.ollama.ok ? `v${data.ollama.version}` : data.ollama.error ?? "down"} ok={data.ollama.ok} optional />
      </Card>

      <Card>
        <p className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Database size={13} /> Local data
        </p>
        <Row label="Database size" value={fmtSize(data.dbSize)} ok={true} />
        <Row label="Database path" value={data.dbPath} ok={true} mono />
        {Object.entries(data.counts).map(([k, v]) => (
          <Row key={k} label={k} value={String(v)} ok={true} />
        ))}
      </Card>

      <Card>
        <p className="text-xs font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Cpu size={13} /> Runtime
        </p>
        <Row label="Node" value={data.nodeVersion} ok={true} mono />
        <Row label="Platform" value={data.platform} ok={true} mono />
      </Card>
    </div>
  );
}

function Row({ label, value, ok, optional, mono }: { label: string; value: string; ok: boolean; optional?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-xs">
      <span className="text-text-secondary capitalize">{label}</span>
      <span className="flex items-center gap-1.5">
        {ok ? <Check size={11} className="text-emerald-400" /> : <AlertCircle size={11} className={optional ? "text-text-muted" : "text-rose-400"} />}
        <span className={mono ? "font-mono text-text-primary text-[11px]" : "text-text-primary"}>{value}</span>
      </span>
    </div>
  );
}
