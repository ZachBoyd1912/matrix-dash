"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Github, RefreshCw, Trash2, ExternalLink, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { timeAgo } from "@/lib/utils/time";
import type { GitHubConnectionPublic, GitHubRepoPublic } from "@/types/jarvis";

function GitHubIntegrationInner() {
  const ref = useGsapEntrance();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<GitHubConnectionPublic[]>([]);
  const [repos, setRepos] = useState<GitHubRepoPublic[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [oauthError, setOauthError] = useState("");
  const [ghEnabled, setGhEnabled] = useState(true);
  const [approveIssue, setApproveIssue] = useState(true);
  const [approvePR, setApprovePR] = useState(true);
  const [approveListRepos, setApproveListRepos] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r, s] = await Promise.all([
        fetch("/api/github/connections").then((r) => r.json()),
        fetch("/api/github/repos").then((r) => r.json()),
        fetch("/api/settings").then((r) => r.json()),
      ]);
      setConnections(Array.isArray(c) ? c : []);
      setRepos(Array.isArray(r) ? r : []);
      setGhEnabled(s.tool_github !== "0");
      setApproveIssue(s.approve_createIssue === "1");
      setApprovePR(s.approve_createPR === "1");
      setApproveListRepos(s.approve_listRepos !== "0");
    } catch {
      // keep previous state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const err = searchParams.get("error");
    if (err) {
      const messages: Record<string, string> = {
        oauth_denied: "Authorization was denied. Check the OAuth consent screen on GitHub.",
        invalid_state: "Session expired. The OAuth state was invalid — try again.",
        token_exchange_failed: "Failed to exchange code for token. Check GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
      };
      setOauthError(messages[err] || `OAuth error: ${err}`);
    }
  }, [refresh, searchParams]);

  const handleOAuth = () => {
    window.location.href = "/api/oauth/github/authorize?redirect_to=" +
      encodeURIComponent(window.location.pathname);
  };

  const syncRepos = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/github/sync", { method: "POST" });
      const data = await res.json();
      if (data.ok) toast.success("Repos synced", `${data.reposSynced} repositories updated`);
      else toast.error("Sync failed", data.error || "Unknown error");
      refresh();
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async (conn: GitHubConnectionPublic) => {
    const ok = await confirm({
      title: `Disconnect GitHub as ${conn.githubUser}?`,
      confirmLabel: "Disconnect",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/github/connections?id=${conn.id}`, { method: "DELETE" });
    toast.success("GitHub disconnected");
    refresh();
  };

  const active = connections.find((c) => c.isActive === true);

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
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div className="orb top-0 left-40 h-40 w-40 bg-sky-500/15" style={{ animationDelay: "-6s" }} />
        <div className="relative">
          <span className="eyebrow">
            <Github size={11} /> GitHub
          </span>
          <h1 className="display text-gradient text-4xl md:text-5xl mt-3">GitHub</h1>
          <p className="text-text-secondary text-sm mt-3 max-w-2xl">
            Connect your GitHub account to let the agent manage repositories, issues, pull requests, and read code.
          </p>
        </div>
      </div>

      {loading && <LoadingSkeleton />}

      {!loading && active && (
        <>
          <Card interactive className="rounded-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {active.avatarUrl ? (
                  <img
                    src={active.avatarUrl}
                    alt={active.githubUser}
                    className="h-10 w-10 rounded-xl shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 grid place-items-center shrink-0">
                    <Github size={18} className="text-emerald-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary">{active.githubUser}</p>
                    <Badge className="bg-emerald-400/10 border-emerald-400/20 text-emerald-400">Connected</Badge>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Scopes: {active.scopes}{active.lastSyncedAt ? ` · Last synced ${timeAgo(active.lastSyncedAt)}` : " · Not synced yet"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="icon" variant="ghost" onClick={syncRepos} disabled={syncing} aria-label="Sync repos">
                  <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => disconnect(active)} aria-label="Disconnect">
                  <Trash2 size={14} className="text-rose-400" />
                </Button>
              </div>
            </div>
          </Card>

          {repos.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-wider text-text-muted mt-6">Repositories ({repos.length})</p>
              <div className="space-y-1">
                {repos.slice(0, 30).map((repo) => (
                  <a
                    key={repo.id}
                    href={repo.htmlUrl || `https://github.com/${repo.fullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Card interactive className="flex items-center gap-3 rounded-xl py-2.5 px-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-text-primary">{repo.fullName}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-text-muted uppercase font-semibold">
                            {repo.isPrivate ? "Private" : "Public"}
                          </span>
                        </div>
                        <p className="text-[11px] text-text-muted mt-0.5">
                          {repo.description && <>{repo.description.split("\n")[0].slice(0, 80)} · </>}
                          {repo.language && <>{repo.language} · </>}
                          ★ {repo.stars ?? 0}
                        </p>
                      </div>
                      <ExternalLink size={12} className="text-text-muted shrink-0" />
                    </Card>
                  </a>
                ))}
              </div>
            </>
          )}

          {repos.length === 0 && (
            <Card className="rounded-2xl text-center py-6">
              <p className="text-xs text-text-secondary">
                No synced repos. Click <RefreshCw size={12} className="inline text-emerald-400" /> to sync your repositories.
              </p>
            </Card>
          )}

          <p className="text-[10px] uppercase tracking-wider text-text-muted mt-6">Agent Tools</p>
          <Card className="rounded-2xl space-y-1">
            <ToolToggle
              label="GitHub tools enabled"
              desc="Allow the agent to create issues, PRs, and read repos"
              checked={ghEnabled}
              setChecked={(v) => { setGhEnabled(v); saveToggle("tool_github", v); }}
            />
            <ToolToggle
              label="createIssue"
              desc="Create issues in connected repositories"
              checked={approveIssue}
              setChecked={(v) => { setApproveIssue(v); saveToggle("approve_createIssue", v); }}
            />
            <ToolToggle
              label="createPR"
              desc="Open pull requests from branches"
              checked={approvePR}
              setChecked={(v) => { setApprovePR(v); saveToggle("approve_createPR", v); }}
            />
            <ToolToggle
              label="listRepos"
              desc="List and search the user's repositories"
              checked={approveListRepos}
              setChecked={(v) => { setApproveListRepos(v); saveToggle("approve_listRepos", v); }}
            />
          </Card>
        </>
      )}

      {!loading && !active && (
        <>
          {oauthError && (
            <Card className="rounded-2xl p-4 border-amber-400/20 bg-amber-400/5 space-y-2 mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-400" />
                <p className="text-sm font-semibold text-amber-400">Connection failed</p>
              </div>
              <p className="text-xs text-text-secondary">{oauthError}</p>
            </Card>
          )}
          <Card className="rounded-2xl text-center py-10">
            <Github size={32} className="mx-auto text-text-muted mb-3" />
            <p className="text-sm text-text-secondary mb-4">
              No GitHub account connected. OAuth is required to let the agent interact with your repos.
            </p>
            <Button variant="primary" onClick={handleOAuth}>
              <Github size={14} /> Connect GitHub Account
            </Button>
            <p className="text-[10px] text-text-muted mt-3">
              Opens github.com in your browser to authorize Matrix Dash
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <Card className="rounded-2xl animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-white/5" />
        <div className="space-y-2 flex-1">
          <div className="h-3 w-32 bg-white/5 rounded" />
          <div className="h-2 w-48 bg-white/5 rounded" />
        </div>
      </div>
    </Card>
  );
}

export default function GitHubIntegrationPage() {
  return (
    <Suspense fallback={<div className="space-y-8"><LoadingSkeleton /></div>}>
      <GitHubIntegrationInner />
    </Suspense>
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
        <p className="text-xs font-medium text-text-primary">{label}</p>
        <p className="text-[10px] text-text-muted">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={setChecked} label={label} />
    </div>
  );
}
