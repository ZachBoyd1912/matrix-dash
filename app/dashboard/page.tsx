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
  GitCompare,
} from "lucide-react";
import { Card } from "@/components/ui/card";
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
    <div ref={ref} className="mx-auto max-w-6xl space-y-8 px-4 py-10 md:px-8">
      {/* Hero */}
      <div className="relative">
        <div className="orb -top-24 left-[15%] h-64 w-64 bg-emerald-500/20" />
        <div
          className="orb -top-10 right-[20%] h-48 w-48 bg-sky-500/15"
          style={{ animationDelay: "-7s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <Sparkles size={11} /> AI Command Center
          </span>
          <h1 className="display text-gradient mt-5 max-w-2xl text-5xl md:text-6xl">
            Your AI command center.
          </h1>
          <p className="text-text-secondary mt-4 max-w-xl text-sm leading-relaxed md:text-base">
            Chat across providers, capture knowledge as it happens, and let the autonomous memory
            system stitch everything into a living graph.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<BrainCircuit size={16} />}
          label="Memories"
          value={stats?.total ?? "—"}
          accent="emerald"
        />
        <StatCard
          icon={<Network size={16} />}
          label="Links"
          value={stats?.links ?? "—"}
          accent="sky"
        />
        <StatCard
          icon={<Pin size={16} />}
          label="Pinned"
          value={stats?.pinned ?? "—"}
          accent="amber"
        />
        <StatCard
          icon={<Sparkles size={16} />}
          label="Identity facts"
          value={stats?.counts.identity ?? "—"}
          accent="emerald"
        />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <QuickCard
          href="/dashboard/chat"
          icon={<MessageSquare size={18} />}
          title="Start a chat"
          description="Stream from any configured provider. Memories load in silently."
          accent="emerald"
        />
        <QuickCard
          href="/dashboard/compare"
          icon={<GitCompare size={18} />}
          title="Compare models"
          description="Run one prompt across models. Generated sites render live."
          accent="sky"
        />
        <QuickCard
          href="/dashboard/memory-bank"
          icon={<BrainCircuit size={18} />}
          title="Browse memory bank"
          description="Inspect the graph, prune duplicates, pin what matters."
          accent="amber"
        />
        <QuickCard
          href="/dashboard/notes"
          icon={<FileText size={18} />}
          title="Open notes"
          description="Obsidian-style wiki notes with [[backlinks]] across the vault."
          accent="rose"
        />
        <QuickCard
          href="/dashboard/sessions"
          icon={<Layers size={18} />}
          title="Resume a session"
          description="Every conversation is logged, searchable, and replayable."
          accent="sky"
        />
        <Card interactive className="overflow-hidden">
          <div className="text-text-muted mb-3 flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase">
            <Code2 size={12} className="text-emerald-400" /> Memory composition
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {(["identity", "project", "global", "lesson"] as const).map((t) => {
              const meta = MEMORY_TYPE_META[t];
              return (
                <div
                  key={t}
                  className={`flex items-center justify-between rounded-lg border ${meta.border} ${meta.bg} px-3 py-2.5`}
                >
                  <span className={`${meta.color} font-medium`}>{meta.label}</span>
                  <span className="text-text-primary font-semibold tabular-nums">
                    {stats?.counts[t] ?? 0}
                  </span>
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
  emerald: "ring-emerald-400/25 text-emerald-400",
  sky: "ring-sky-400/25 text-sky-400",
  amber: "ring-amber-400/25 text-amber-400",
  rose: "ring-rose-400/25 text-rose-400",
};

function StatCard({ icon, label, value, accent }: StatProps) {
  return (
    <Card interactive className="cursor-default">
      <div className="mb-3 flex items-center gap-2">
        <div
          className={`grid h-8 w-8 place-items-center rounded-lg ring-1 ${ACCENT_RING[accent]} bg-white/[0.02]`}
        >
          {icon}
        </div>
        <span className="text-text-muted text-[10px] tracking-[0.16em] uppercase">{label}</span>
      </div>
      <div className="text-text-primary display text-3xl font-bold tabular-nums">{value}</div>
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
    <Link href={href} className="group block">
      <Card interactive className="h-full">
        <div className="flex items-start justify-between">
          <div
            className={`grid h-10 w-10 place-items-center rounded-xl ring-1 ${ACCENT_RING[accent]} bg-white/[0.02]`}
          >
            {icon}
          </div>
          <span className="text-text-muted group-hover:text-text-primary grid h-8 w-8 place-items-center rounded-full border border-white/5 bg-white/[0.04] transition-colors group-hover:border-white/15">
            <ArrowUpRight size={15} className="island-icon" />
          </span>
        </div>
        <div className="mt-4">
          <h3 className="text-text-primary text-sm font-semibold">{title}</h3>
          <p className="text-text-secondary mt-1 text-xs leading-relaxed">{description}</p>
        </div>
      </Card>
    </Link>
  );
}
