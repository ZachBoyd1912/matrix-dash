"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  MessageSquare,
  BrainCircuit,
  FileText,
  Layers,
  Code2,
  Sparkles,
  ArrowUpRight,
  Network,
  Pin,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { MEMORY_TYPE_META } from "@/types/memory";

interface MemoryStats {
  total: number;
  links: number;
  pinned: number;
  counts: Record<string, number>;
}

export default function Overview() {
  const ref = useGsapEntrance();
  const [stats, setStats] = useState<MemoryStats | null>(null);

  useEffect(() => {
    fetch("/api/memories/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <div ref={ref} className="px-4 md:px-8 py-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Your AI command center.
        </h1>
        <p className="text-text-secondary text-sm mt-2 max-w-xl">
          Chat across providers, capture knowledge as it happens, and let the
          autonomous memory system stitch everything into a graph.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<BrainCircuit size={16} />} label="Memories" value={stats?.total ?? "—"} accent="emerald" />
        <StatCard icon={<Network size={16} />} label="Links" value={stats?.links ?? "—"} accent="sky" />
        <StatCard icon={<Pin size={16} />} label="Pinned" value={stats?.pinned ?? "—"} accent="amber" />
        <StatCard icon={<Sparkles size={16} />} label="Identity facts" value={stats?.counts.identity ?? "—"} accent="emerald" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <QuickCard
          href="/dashboard/chat"
          icon={<MessageSquare size={18} />}
          title="Start a chat"
          description="Stream from any configured provider. Memories load in silently."
          accent="emerald"
        />
        <QuickCard
          href="/dashboard/memory-bank"
          icon={<BrainCircuit size={18} />}
          title="Browse memory bank"
          description="Inspect the graph, prune duplicates, pin what matters."
          accent="sky"
        />
        <QuickCard
          href="/dashboard/notes"
          icon={<FileText size={18} />}
          title="Open notes"
          description="Obsidian-style wiki notes with [[backlinks]] across the vault."
          accent="amber"
        />
        <QuickCard
          href="/dashboard/sessions"
          icon={<Layers size={18} />}
          title="Resume a session"
          description="Every conversation is logged, searchable, and replayable."
          accent="rose"
        />
        <QuickCard
          href="/dashboard/ide"
          icon={<Code2 size={18} />}
          title="Edit in the IDE"
          description="Monaco editor, tabs, language detection — all in-app."
          accent="sky"
        />
        <Card className="hover:bg-white/[0.03] transition-colors">
          <div className="text-xs uppercase tracking-wider text-text-muted mb-2">
            Memory composition
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {(["identity", "project", "global", "lesson"] as const).map((t) => {
              const meta = MEMORY_TYPE_META[t];
              return (
                <div
                  key={t}
                  className={`flex items-center justify-between rounded-md border ${meta.border} ${meta.bg} px-3 py-2`}
                >
                  <span className={`${meta.color} font-medium`}>{meta.label}</span>
                  <span className="text-text-primary tabular-nums">{stats?.counts[t] ?? 0}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

interface StatProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  accent: "emerald" | "sky" | "amber" | "rose";
}

const ACCENT_RING: Record<StatProps["accent"], string> = {
  emerald: "ring-emerald-400/20 text-emerald-400",
  sky: "ring-sky-400/20 text-sky-400",
  amber: "ring-amber-400/20 text-amber-400",
  rose: "ring-rose-400/20 text-rose-400",
};

function StatCard({ icon, label, value, accent }: StatProps) {
  return (
    <Card className="hover:translate-y-[-2px] hover:bg-white/[0.04] cursor-default">
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-7 w-7 rounded-md grid place-items-center ring-1 ${ACCENT_RING[accent]} bg-white/[0.02]`}>
          {icon}
        </div>
        <span className="text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums text-text-primary">{value}</div>
    </Card>
  );
}

interface QuickProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: "emerald" | "sky" | "amber" | "rose";
}

function QuickCard({ href, icon, title, description, accent }: QuickProps) {
  return (
    <Link href={href} className="block group">
      <Card className="h-full hover:translate-y-[-2px] hover:bg-white/[0.04] hover:border-white/10">
        <div className="flex items-start justify-between">
          <div className={`h-9 w-9 rounded-lg grid place-items-center ring-1 ${ACCENT_RING[accent]} bg-white/[0.02]`}>
            {icon}
          </div>
          <ArrowUpRight
            size={16}
            className="text-text-muted group-hover:text-text-primary transition-colors"
          />
        </div>
        <div className="mt-3">
          <h3 className="font-semibold text-sm text-text-primary">{title}</h3>
          <p className="text-xs text-text-secondary mt-1">{description}</p>
        </div>
      </Card>
    </Link>
  );
}
