"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, RefreshCw, Trash2, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import type { SlackWorkspacePublic, SlackChannelPublic } from "@/types/jarvis";

export default function SlackIntegrationPage() {
  const ref = useGsapEntrance();
  const [workspaces, setWorkspaces] = useState<SlackWorkspacePublic[]>([]);
  const [channels, setChannels] = useState<SlackChannelPublic[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const [w] = await Promise.all([
      fetch("/api/slack/workspaces").then((r) => r.json()),
    ]);
    const ws = Array.isArray(w) ? w : [];
    setWorkspaces(ws);
    if (ws.length > 0) {
      const c = await fetch(`/api/slack/workspaces/${ws[0].id}/channels`).then((r) => r.json());
      setChannels(Array.isArray(c) ? c : []);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleOAuth = () => {
    window.location.href = "/api/oauth/slack/authorize?redirect_to=" +
      encodeURIComponent(window.location.pathname);
  };

  const syncChannels = async () => {
    if (workspaces.length === 0) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/slack/workspaces/${workspaces[0].id}/channels`, { method: "POST" });
      const data = await res.json();
      if (data.ok) toast.success("Channels synced", `${data.channelsSynced} channels updated`);
      else toast.error("Sync failed", data.error);
      refresh();
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async (ws: SlackWorkspacePublic) => {
    const ok = await confirm({
      title: `Disconnect ${ws.teamName}?`,
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/slack/workspaces?id=${ws.id}`, { method: "DELETE" });
    toast.success("Slack workspace disconnected");
    refresh();
  };

  const active = workspaces.find((w) => w.isActive);

  return (
    <div ref={ref} className="space-y-8">
      <div className="relative isolate py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-violet-500/20" />
        <div className="orb top-0 left-40 h-40 w-40 bg-pink-500/15" style={{ animationDelay: "-6s" }} />
        <div className="relative">
          <span className="eyebrow">
            <MessageSquare size={11} /> Slack
          </span>
          <h1 className="display text-gradient text-4xl md:text-5xl font-extrabold mt-3">Slack</h1>
          <p className="text-text-secondary text-sm mt-3 max-w-2xl">
            Send summaries, search messages, and let the agent communicate through your connected Slack workspace.
          </p>
        </div>
      </div>

      {active && (
        <>
          <Card interactive className="rounded-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 grid place-items-center shrink-0">
                  <MessageSquare size={18} className="text-violet-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary">{active.teamName}</p>
                    <Badge className="bg-violet-400/10 border-violet-400/20 text-violet-400">● Connected</Badge>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Workspace ID: {active.teamId} · {channels.length} channels
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="icon" variant="ghost" onClick={syncChannels} disabled={syncing} aria-label="Sync channels">
                  <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => disconnect(active)} aria-label="Disconnect">
                  <Trash2 size={14} className="text-rose-400" />
                </Button>
              </div>
            </div>
          </Card>

          {channels.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Channels ({channels.length})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {channels.slice(0, 12).map((ch) => (
                  <Card key={ch.id} interactive className="flex items-center gap-2 rounded-lg py-2 px-3">
                    <span className="text-violet-400 font-bold text-xs">#</span>
                    <span className="text-xs text-text-primary">{ch.name}</span>
                    {ch.topic && (
                      <span className="text-[10px] text-text-muted ml-auto truncate max-w-[120px]">
                        {ch.topic}
                      </span>
                    )}
                  </Card>
                ))}
              </div>
            </>
          )}

          <p className="text-[10px] uppercase tracking-wider text-text-muted mt-6">Agent Tools</p>
          <Card className="rounded-2xl space-y-1">
            <ToolToggle label="Slack tools enabled" desc="Allow the agent to send messages and search channels" />
            <ToolToggle label="sendSlackMessage" desc="Send messages to any public channel" />
            <ToolToggle label="listSlackChannels" desc="List available channels in the workspace" />
            <ToolToggle label="searchSlack" desc="Search messages across channels" />
          </Card>

          <p className="text-[10px] uppercase tracking-wider text-text-muted">Auto-Summary</p>
          <Card className="rounded-2xl space-y-1">
            <ToolToggle label="Daily agent summary" desc="Post an overnight agent summary to a channel every morning at 08:00" />
            <ToolToggle label="Weekly memory digest" desc="Post a digest of new memories on Monday 09:00" />
          </Card>
        </>
      )}

      {!active && (
        <Card className="rounded-2xl text-center py-10">
          <MessageSquare size={32} className="mx-auto text-text-muted mb-3" />
          <p className="text-sm text-text-secondary mb-4">
            No Slack workspace connected. Install the Matrix Dash bot into your workspace to enable messaging and search.
          </p>
          <Button variant="primary" onClick={handleOAuth}>
            <MessageSquare size={14} /> Add to Slack
          </Button>
          <p className="text-[10px] text-text-muted mt-3">
            You&apos;ll be redirected to Slack to authorize the Matrix Dash bot
          </p>
        </Card>
      )}
    </div>
  );
}

function ToolToggle({ label, desc }: { label: string; desc: string }) {
  const [checked, setChecked] = useState(true);
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-xs font-medium text-text-primary">{label}</p>
        <p className="text-[10px] text-text-muted">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={setChecked} label={label} />
    </div>
  );
}
