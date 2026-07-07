"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, RefreshCw, FolderCog, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";

type SyncDirection = "bidirectional" | "to-vault" | "from-vault";

interface SyncStatus {
  enabled: boolean;
  vaultPath: string;
  direction: SyncDirection;
  noteCount: number;
  memoryCount: number;
  syncedNoteCount: number;
  syncedMemoryCount: number;
}

interface ReconcileResult {
  notesToVault: number;
  notesFromVault: number;
  memoriesToVault: number;
  memoriesFromVault: number;
}

const DIRECTION_OPTIONS: { value: SyncDirection; label: string }[] = [
  { value: "bidirectional", label: "Bidirectional (two-way sync)" },
  { value: "to-vault", label: "To vault only (Matrix Dash → Obsidian)" },
  { value: "from-vault", label: "From vault only (Obsidian → Matrix Dash)" },
];

export default function ObsidianIntegrationPage() {
  const ref = useGsapEntrance();

  const [vaultPath, setVaultPath] = useState("");
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [direction, setDirection] = useState<SyncDirection>("bidirectional");
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<ReconcileResult | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/notes/sync/status");
      const data: SyncStatus = await res.json();
      setStatus(data);
    } catch {
      // keep previous status
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const s: Record<string, string> = await res.json();
      setVaultPath(s.obsidianVaultPath ?? "");
      setSyncEnabled(s.obsidianSyncEnabled === "1");
      setDirection((s.obsidianSyncDirection as SyncDirection) || "bidirectional");
    } catch {
      // keep previous state
    }
  }, []);

  useEffect(() => {
    refreshSettings();
    refreshStatus();
  }, [refreshSettings, refreshStatus]);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          obsidianVaultPath: vaultPath,
          obsidianSyncEnabled: syncEnabled,
          obsidianSyncDirection: direction,
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      toast.success("Obsidian settings saved");
      refreshStatus();
    } catch {
      toast.error("Failed to save settings", "Check the server logs for details");
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/notes/sync", { method: "POST" });
      if (!res.ok) throw new Error("Request failed");
      const data: ReconcileResult = await res.json();
      setLastResult(data);
      const total =
        data.notesToVault + data.notesFromVault + data.memoriesToVault + data.memoriesFromVault;
      if (total > 0) {
        toast.success(
          "Sync complete",
          `${data.notesToVault} notes → vault, ${data.notesFromVault} notes ← vault, ${data.memoriesToVault} memories → vault, ${data.memoriesFromVault} memories ← vault`
        );
      } else {
        toast.info(
          "Sync complete",
          "Nothing to sync — check that sync is enabled and the vault path is set"
        );
      }
      refreshStatus();
    } catch {
      toast.error("Sync failed", "Check the server logs for details");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div ref={ref} className="space-y-8">
      <div className="relative isolate py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-indigo-500/20" />
        <div
          className="orb top-0 left-40 h-40 w-40 bg-violet-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <BookOpen size={11} /> Obsidian
          </span>
          <h1 className="display text-gradient mt-3 text-4xl md:text-5xl">Obsidian Vault Sync</h1>
          <p className="text-text-secondary mt-3 max-w-2xl text-sm">
            Two-way sync between Matrix Dash notes/memories and a local Obsidian vault. Notes live
            under <code className="rounded bg-white/5 px-1">Matrix Notes/</code> and memories under{" "}
            <code className="rounded bg-white/5 px-1">Memory Bank/</code> inside the vault.
          </p>
        </div>
      </div>

      {/* Status */}
      <Card interactive className="rounded-2xl">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5">
              <BookOpen size={18} className="text-indigo-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-text-primary text-sm font-medium">
                  {status?.vaultPath || "No vault configured"}
                </p>
                {status?.enabled ? (
                  <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-400">
                    ● Enabled
                  </Badge>
                ) : (
                  <Badge className="text-text-secondary border border-white/10 bg-white/10">
                    Disabled
                  </Badge>
                )}
              </div>
              <p className="text-text-muted mt-0.5 text-[11px]">
                {status
                  ? `Direction: ${status.direction} · ${status.syncedNoteCount}/${status.noteCount} notes synced · ${status.syncedMemoryCount}/${status.memoryCount} memories synced`
                  : "Loading status…"}
              </p>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={syncNow}
            disabled={syncing}
            aria-label="Sync now"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
          </Button>
        </div>
      </Card>

      {lastResult && (
        <Card className="rounded-2xl">
          <p className="text-text-muted mb-2 text-[10px] tracking-wider uppercase">
            Last sync result
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ResultTile label="Notes → vault" value={lastResult.notesToVault} />
            <ResultTile label="Notes ← vault" value={lastResult.notesFromVault} />
            <ResultTile label="Memories → vault" value={lastResult.memoriesToVault} />
            <ResultTile label="Memories ← vault" value={lastResult.memoriesFromVault} />
          </div>
        </Card>
      )}

      {/* Config */}
      <p className="text-text-muted text-[10px] tracking-wider uppercase">Configuration</p>
      <Card className="space-y-4 rounded-2xl">
        <div>
          <label className="text-text-muted mb-1 block text-[10px] uppercase">Vault path</label>
          <div className="flex items-center gap-2">
            <FolderCog size={14} className="text-text-muted shrink-0" />
            <Input
              value={vaultPath}
              onChange={(e) => setVaultPath(e.target.value)}
              placeholder="/Users/you/Documents/MyVault"
              className="font-mono text-xs"
            />
          </div>
          <p className="text-text-muted mt-1 text-[10px]">
            This is an absolute path on the <strong>server filesystem</strong> where Matrix Dash
            runs — not a path in your browser or on this device. The folder must already exist.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-text-primary text-xs font-medium">Sync enabled</p>
            <p className="text-text-muted text-[10px]">
              Watch the vault and Matrix Dash for changes and keep them in sync
            </p>
          </div>
          <Switch checked={syncEnabled} onCheckedChange={setSyncEnabled} label="Sync enabled" />
        </div>

        <div>
          <label className="text-text-muted mb-1 block text-[10px] uppercase">Sync direction</label>
          <Select
            value={direction}
            onChange={(e) => setDirection(e.target.value as SyncDirection)}
            className="w-full"
          >
            {DIRECTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="primary" onClick={saveSettings} disabled={saving}>
            <Save size={14} /> Save settings
          </Button>
          <Button variant="ghost" onClick={syncNow} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> Sync now
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ResultTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
      <p className="text-text-primary text-lg font-semibold">{value}</p>
      <p className="text-text-muted text-[10px]">{label}</p>
    </div>
  );
}
