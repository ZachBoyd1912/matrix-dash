"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, RefreshCw, Trash2 } from "lucide-react";
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
  // Toggle state from settings
  const [slEnabled, setSlEnabled] = useState(true);
  const [approveSlackMsg, setApproveSlackMsg] = useState(true);
  const [approveSlackList, setApproveSlackList] = useState(true);
  const [approveSlackSearch, setApproveSlackSearch] = useState(true);
  const [dailySummary, setDailySummary] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(false);

  const refresh = useCallback(async () => {
    const [w, s] = await Promise.all([
      fetch("/api/slack/workspaces").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]);
    const ws = Array.isArray(w) ? w : [];
    setWorkspaces(ws);
    if (ws.length > 0) {
      const c = await fetch(`/api/slack/workspaces/${ws[0].id}/channels`).then((r) => r.json());
      setChannels(Array.isArray(c) ? c : []);
    }
    // Load toggle states from settings
    setSlEnabled(s.tool_slack !== "0");
    setApproveSlackMsg(s.approve_sendSlackMessage === "1");
    setApproveSlackList(s.approve_listSlackChannels !== "0");
    setApproveSlackSearch(s.approve_searchSlack !== "0");
    setDailySummary(s.slack_summary_daily === "1");
    setWeeklyDigest(s.slack_summary_weekly === "1");
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleOAuth = () => {
    window.location.href =
      "/api/oauth/slack/authorize?redirect_to=" + encodeURIComponent(window.location.pathname);
  };

  const syncChannels = async () => {
    if (workspaces.length === 0) return;
    setSyncing(true);
    try {
      const res = await fetch(`/api/slack/workspaces/${workspaces[0].id}/channels`, {
        method: "POST",
      });
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

  const saveToggle = async (key: string, value: boolean) => {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [key]: value ? "1" : "0" }),
    });
  };

  return (
    <div ref={ref} className="space-y-8">
      <div className="relative isolate py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-violet-500/20" />
        <div
          className="orb top-0 left-40 h-40 w-40 bg-pink-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <MessageSquare size={11} /> Slack
          </span>
          <h1 className="display text-gradient mt-3 text-4xl md:text-5xl">Slack</h1>
          <p className="text-text-secondary mt-3 max-w-2xl text-sm">
            Send summaries, search messages, and let the agent communicate through your connected
            Slack workspace.
          </p>
        </div>
      </div>

      {active && (
        <>
          <Card interactive className="rounded-2xl">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5">
                  <MessageSquare size={18} className="text-violet-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-text-primary text-sm font-medium">{active.teamName}</p>
                    <Badge className="border-violet-400/20 bg-violet-400/10 text-violet-400">
                      ● Connected
                    </Badge>
                  </div>
                  <p className="text-text-muted mt-0.5 text-[11px]">
                    Workspace ID: {active.teamId} · {channels.length} channels
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={syncChannels}
                  disabled={syncing}
                  aria-label="Sync channels"
                >
                  <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => disconnect(active)}
                  aria-label="Disconnect"
                >
                  <Trash2 size={14} className="text-rose-400" />
                </Button>
              </div>
            </div>
          </Card>

          {channels.length > 0 && (
            <>
              <p className="text-text-muted text-[10px] tracking-wider uppercase">
                Channels ({channels.length})
              </p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {channels.slice(0, 12).map((ch) => (
                  <Card
                    key={ch.id}
                    interactive
                    className="flex items-center gap-2 rounded-lg px-3 py-2"
                  >
                    <span className="text-xs font-bold text-violet-400">#</span>
                    <span className="text-text-primary text-xs">{ch.name}</span>
                    {ch.topic && (
                      <span className="text-text-muted ml-auto max-w-[120px] truncate text-[10px]">
                        {ch.topic}
                      </span>
                    )}
                  </Card>
                ))}
              </div>
            </>
          )}

          <p className="text-text-muted mt-6 text-[10px] tracking-wider uppercase">Agent Tools</p>
          <Card className="space-y-1 rounded-2xl">
            <ToolToggle
              label="Slack tools enabled"
              desc="Allow the agent to send messages and search channels"
              checked={slEnabled}
              setChecked={(v) => {
                setSlEnabled(v);
                saveToggle("tool_slack", v);
              }}
            />
            <ToolToggle
              label="sendSlackMessage"
              desc="Send messages to any public channel"
              checked={approveSlackMsg}
              setChecked={(v) => {
                setApproveSlackMsg(v);
                saveToggle("approve_sendSlackMessage", v);
              }}
            />
            <ToolToggle
              label="listSlackChannels"
              desc="List available channels in the workspace"
              checked={approveSlackList}
              setChecked={(v) => {
                setApproveSlackList(v);
                saveToggle("approve_listSlackChannels", v);
              }}
            />
            <ToolToggle
              label="searchSlack"
              desc="Search messages across channels"
              checked={approveSlackSearch}
              setChecked={(v) => {
                setApproveSlackSearch(v);
                saveToggle("approve_searchSlack", v);
              }}
            />
          </Card>

          <p className="text-text-muted text-[10px] tracking-wider uppercase">Auto-Summary</p>
          <Card className="space-y-1 rounded-2xl">
            <ToolToggle
              label="Daily agent summary"
              desc="Post an overnight agent summary to a channel every morning at 08:00"
              checked={dailySummary}
              setChecked={(v) => {
                setDailySummary(v);
                saveToggle("slack_summary_daily", v);
              }}
            />
            <ToolToggle
              label="Weekly memory digest"
              desc="Post a digest of new memories on Monday 09:00"
              checked={weeklyDigest}
              setChecked={(v) => {
                setWeeklyDigest(v);
                saveToggle("slack_summary_weekly", v);
              }}
            />
          </Card>
        </>
      )}

      {!active && (
        <Card className="rounded-2xl py-10 text-center">
          <MessageSquare size={32} className="text-text-muted mx-auto mb-3" />
          <p className="text-text-secondary mb-4 text-sm">
            No Slack workspace connected. Install the Matrix Dash bot into your workspace to enable
            messaging and search.
          </p>
          <Button variant="primary" onClick={handleOAuth}>
            <MessageSquare size={14} /> Add to Slack
          </Button>
          <p className="text-text-muted mt-3 text-[10px]">
            You&apos;ll be redirected to Slack to authorize the Matrix Dash bot
          </p>
        </Card>
      )}
    </div>
  );
}

function ToolToggle({
  label,
  desc,
  checked,
  setChecked,
}: {
  label: string;
  desc: string;
  checked: boolean;
  setChecked: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-text-primary text-xs font-medium">{label}</p>
        <p className="text-text-muted text-[10px]">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={setChecked} label={label} />
    </div>
  );
}
