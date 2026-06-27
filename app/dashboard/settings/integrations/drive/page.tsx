"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDrive, RefreshCw, Trash2, FolderOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { timeAgo } from "@/lib/utils/time";
import type { DriveConnectionPublic, DriveDocPublic } from "@/types/jarvis";

export default function DriveIntegrationPage() {
  const ref = useGsapEntrance();
  const [connections, setConnections] = useState<DriveConnectionPublic[]>([]);

  const refresh = useCallback(async () => {
    // Drive API routes are stubs — show empty state for now
    setConnections([]);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const active = connections.find((c) => c.isActive);

  return (
    <div ref={ref} className="space-y-8">
      <div className="relative isolate py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-amber-500/20" />
        <div className="orb top-0 left-40 h-40 w-40 bg-emerald-500/15" style={{ animationDelay: "-6s" }} />
        <div className="relative">
          <span className="eyebrow">
            <HardDrive size={11} /> Google Drive
          </span>
          <h1 className="display text-gradient text-4xl md:text-5xl font-extrabold mt-3">Google Drive</h1>
          <p className="text-text-secondary text-sm mt-3 max-w-2xl">
            Pull documents into the notes system and let the agent reference your Drive files in chat for context-aware answers.
          </p>
        </div>
      </div>

      {active && (
        <>
          <Card interactive className="rounded-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 grid place-items-center shrink-0">
                  <HardDrive size={18} className="text-amber-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary">{active.googleEmail}</p>
                    <Badge className="bg-amber-400/10 border-amber-400/20 text-amber-400">● Connected</Badge>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Scope: {active.scopes}
                  </p>
                </div>
              </div>
              <Button size="icon" variant="ghost" aria-label="Disconnect">
                <Trash2 size={14} className="text-rose-400" />
              </Button>
            </div>
          </Card>

          <p className="text-[10px] uppercase tracking-wider text-text-muted">Auto-Import</p>
          <Card className="rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-text-primary">Watch folder for new documents</p>
                <p className="text-[10px] text-text-muted">Automatically sync new files dropped into this folder</p>
              </div>
              <Switch checked={true} onCheckedChange={() => {}} label="Watch folder" />
            </div>
            <div className="flex items-center gap-2">
              <FolderOpen size={14} className="text-text-muted shrink-0" />
              <Input value="My Drive / Matrix Dash" readOnly className="text-xs" />
              <Button variant="ghost" size="sm">Browse</Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-text-primary">Auto-extract to Notes</p>
                <p className="text-[10px] text-text-muted">Convert synced Docs and PDFs into searchable Notes</p>
              </div>
              <Switch checked={true} onCheckedChange={() => {}} label="Auto-extract" />
            </div>
          </Card>
        </>
      )}

      {!active && (
        <Card className="rounded-2xl text-center py-10">
          <HardDrive size={32} className="mx-auto text-text-muted mb-3" />
          <p className="text-sm text-text-secondary mb-4">
            Connect your Google account to pull documents into Matrix Dash.
          </p>
          <Button variant="primary" disabled>
            <HardDrive size={14} /> Connect Google Drive
          </Button>
          <p className="text-[10px] text-text-muted mt-3">
            Matrix Dash requests drive.readonly scope — your files stay private to your machine
          </p>
        </Card>
      )}
    </div>
  );
}
