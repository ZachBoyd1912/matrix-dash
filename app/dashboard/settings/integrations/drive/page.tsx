"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HardDrive, Trash2, FolderOpen, AlertTriangle } from "lucide-react";

function getSiteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { timeAgo } from "@/lib/utils/time";
import type { DriveConnectionPublic } from "@/types/jarvis";

export default function DriveIntegrationPage() {
  const ref = useGsapEntrance();
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<DriveConnectionPublic[]>([]);
  const [watchFolder, setWatchFolder] = useState(false);
  const [autoExtract, setAutoExtract] = useState(false);
  const [oauthError, setOauthError] = useState("");

  const refresh = useCallback(async () => {
    const [c, s] = await Promise.all([
      fetch("/api/drive/connections")
        .then((r) => r.json())
        .catch(() => []),
      fetch("/api/settings")
        .then((r) => r.json())
        .catch(() => ({})),
    ]);
    setConnections(Array.isArray(c) ? c : []);
    setWatchFolder(s.driveWatchFolder === "1");
    setAutoExtract(s.driveAutoExtract !== "0");
  }, []);

  useEffect(() => {
    refresh();
    const err = searchParams.get("error");
    const msg = searchParams.get("msg");
    if (err) {
      const messages: Record<string, string> = {
        missing_env: msg ? decodeURIComponent(msg) : "GOOGLE_CLIENT_ID not set in .env.local",
        oauth_denied: "Authorization was denied. Check the OAuth consent screen permissions.",
        invalid_state: "Session expired. The OAuth state was invalid — try again.",
        token_exchange_failed: "Failed to exchange code for token. Check GOOGLE_CLIENT_SECRET.",
      };
      setOauthError(messages[err] || `OAuth error: ${err}`);
    }
  }, [refresh, searchParams]);

  const saveToggle = async (key: string, value: boolean) => {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [key]: value ? "1" : "0" }),
    });
  };

  const handleOAuth = () => {
    window.location.href =
      "/api/oauth/drive/authorize?redirect_to=" + encodeURIComponent(window.location.pathname);
  };

  const disconnect = async (conn: DriveConnectionPublic) => {
    const ok = await confirm({
      title: `Disconnect ${conn.googleEmail} from Drive?`,
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/drive/connections?id=${conn.id}`, { method: "DELETE" });
    toast.success("Drive disconnected");
    refresh();
  };

  const active = connections.find((c) => c.isActive);

  return (
    <div ref={ref} className="space-y-8">
      <div className="relative isolate py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-amber-500/20" />
        <div
          className="orb top-0 left-40 h-40 w-40 bg-emerald-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <HardDrive size={11} /> Google Drive
          </span>
          <h1 className="display text-gradient mt-3 text-4xl md:text-5xl">Google Drive</h1>
          <p className="text-text-secondary mt-3 max-w-2xl text-sm">
            Pull documents into the notes system and let the agent reference your Drive files in
            chat for context-aware answers.
          </p>
        </div>
      </div>

      {active && (
        <>
          <Card interactive className="rounded-2xl">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5">
                  <HardDrive size={18} className="text-amber-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-text-primary text-sm font-medium">{active.googleEmail}</p>
                    <Badge className="border-amber-400/20 bg-amber-400/10 text-amber-400">
                      ● Connected
                    </Badge>
                  </div>
                  <p className="text-text-muted mt-0.5 text-[11px]">
                    Scope: {active.scopes} · Connected {timeAgo(active.createdAt)}
                  </p>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => disconnect(active)}
                aria-label="Disconnect"
              >
                <Trash2 size={14} className="text-rose-400" />
              </Button>
            </div>
          </Card>

          <p className="text-text-muted text-[10px] tracking-wider uppercase">Auto-Import</p>
          <Card className="space-y-3 rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-primary text-xs font-medium">
                  Watch folder for new documents
                </p>
                <p className="text-text-muted text-[10px]">
                  Automatically sync new files dropped into this folder
                </p>
              </div>
              <Switch
                checked={watchFolder}
                onCheckedChange={(v) => {
                  setWatchFolder(v);
                  saveToggle("driveWatchFolder", v);
                }}
                label="Watch folder"
              />
            </div>
            <div className="flex items-center gap-2">
              <FolderOpen size={14} className="text-text-muted shrink-0" />
              <Input value="My Drive / Matrix Dash" readOnly className="text-xs" />
              <Button variant="ghost" size="sm">
                Browse
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-text-primary text-xs font-medium">Auto-extract to Notes</p>
                <p className="text-text-muted text-[10px]">
                  Convert synced Docs and PDFs into searchable Notes
                </p>
              </div>
              <Switch
                checked={autoExtract}
                onCheckedChange={(v) => {
                  setAutoExtract(v);
                  saveToggle("driveAutoExtract", v);
                }}
                label="Auto-extract"
              />
            </div>
          </Card>
        </>
      )}

      {!active && (
        <>
          {oauthError && (
            <Card className="mb-4 space-y-2 rounded-2xl border-amber-400/20 bg-amber-400/5 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400" />
                <p className="text-sm font-semibold text-amber-400">Configuration needed</p>
              </div>
              <p className="text-text-secondary text-xs">{oauthError}</p>
              <p className="text-text-muted text-[10px]">
                Add <code className="rounded bg-white/5 px-1">GOOGLE_CLIENT_ID</code> and{" "}
                <code className="rounded bg-white/5 px-1">GOOGLE_CLIENT_SECRET</code> to{" "}
                <code className="rounded bg-white/5 px-1">.env.local</code>. Redirect URI:{" "}
                <code className="rounded bg-white/5 px-1">
                  {getSiteOrigin()}/api/oauth/drive/callback
                </code>
              </p>
            </Card>
          )}
          <Card className="rounded-2xl py-10 text-center">
            <HardDrive size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-text-secondary mb-4 text-sm">
              Connect your Google account to pull documents into Matrix Dash.
            </p>
            <Button variant="primary" onClick={handleOAuth}>
              <HardDrive size={14} /> Connect Google Drive
            </Button>
            <p className="text-text-muted mt-3 text-[10px]">
              Matrix Dash requests drive.readonly scope — your files stay private to your machine
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
