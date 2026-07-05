"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Download, Trash2, DatabaseBackup } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { timeAgo } from "@/lib/utils/time";

interface Backup {
  name: string;
  size: number;
  createdAt: string;
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export default function BackupsPage() {
  const ref = useGsapEntrance();
  const [list, setList] = useState<Backup[]>([]);
  const [autoBackup, setAutoBackup] = useState(true);

  const refresh = useCallback(async () => {
    const [b, s] = await Promise.all([
      fetch("/api/backups").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]);
    setList(b);
    setAutoBackup(s.autoBackup !== "0");
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    const res = await fetch("/api/backups", { method: "POST" });
    if (res.ok) toast.success("Backup created");
    refresh();
  };

  const toggleAuto = async (v: boolean) => {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ autoBackup: v }),
    });
    setAutoBackup(v);
  };

  const remove = async (b: Backup) => {
    const ok = await confirm({ title: `Delete ${b.name}?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    await fetch(`/api/backups?name=${encodeURIComponent(b.name)}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div ref={ref} className="space-y-8">
      <div className="relative py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div
          className="orb -top-8 left-44 h-44 w-44 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <DatabaseBackup size={11} /> Snapshots
          </span>
          <h2 className="display text-gradient text-4xl md:text-5xl mt-3">
            Backups
          </h2>
          <p className="text-text-secondary text-sm mt-3">
            Auto-snapshots of everything in <code className="text-emerald-300">~/MatrixDash/backups</code>. Last 10 kept.
          </p>
        </div>
      </div>

      <Card interactive>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">Nightly auto-backup</p>
            <p className="text-xs text-text-secondary mt-0.5">Runs at 4:00 am local time.</p>
          </div>
          <Switch checked={autoBackup} onCheckedChange={toggleAuto} label="Auto backup" />
        </div>
      </Card>

      <Button variant="primary" onClick={create}>
        <Archive size={14} /> Backup now
      </Button>

      {list.length === 0 ? (
        <EmptyState icon={<Archive size={16} />} title="No backups yet" />
      ) : (
        <div className="space-y-3">
          {list.map((b) => (
            <Card key={b.name} interactive className="flex items-center justify-between gap-3 rounded-xl">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary font-mono">{b.name}</p>
                <p className="text-[11px] text-text-muted mt-0.5">
                  {fmtSize(b.size)} · {timeAgo(b.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => remove(b)} aria-label="Delete">
                  <Trash2 size={13} className="text-rose-400" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
