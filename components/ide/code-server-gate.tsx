"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, HardDrive, Loader2, Play, ServerCog, Sparkles, X } from "lucide-react";
import { CodeServerInstallPanel } from "@/components/ide/code-server-install-panel";
import { CodeServerEmbed } from "@/components/ide/code-server-embed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/stores/use-feedback";
import type { WorkspaceRecord } from "@/types/workspace";

/** Shape returned by GET /api/ide/server. */
interface ServerStatus {
  running: boolean;
  port: number;
  url: string;
  pid?: number;
  memMb?: number;
  cpu?: number;
  version?: string;
}

interface InstallStatus {
  installed: boolean;
  version?: string;
  bin?: string;
}

interface ServerActionResponse {
  ok: boolean;
  status?: ServerStatus;
  error?: string;
}

type Phase = "loading" | "install" | "picker" | "starting" | "running";

const LAST_FOLDER_KEY = "ide:lastFolder";
const POLL_INTERVAL_MS = 1500;
const POLL_MAX_TRIES = 40;

function basename(p: string): string {
  return p.split("/").filter(Boolean).pop() ?? p;
}

/**
 * Orchestrates the code-server lifecycle for the IDE tab: checks whether the
 * binary is installed, lets the user pick a folder to launch, starts/polls the
 * server, then embeds it. All async work is guarded against unmount so polling
 * never calls setState on a torn-down component.
 */
export default function CodeServerGate() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [install, setInstall] = useState<InstallStatus>({ installed: false });
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [folder, setFolder] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [recents, setRecents] = useState<WorkspaceRecord[]>([]);
  const [launching, setLaunching] = useState(false);
  const [busy, setBusy] = useState(false);

  // Track mount status + any in-flight poll timer so we can clean both up.
  const mounted = useRef(true);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearPoll();
    };
  }, [clearPoll]);

  // ─── Fetch helpers ─────────────────────────────────────
  const fetchInstall = useCallback(async (): Promise<InstallStatus> => {
    try {
      const res = await fetch("/api/ide/server/install");
      if (!res.ok) return { installed: false };
      return (await res.json()) as InstallStatus;
    } catch {
      return { installed: false };
    }
  }, []);

  const fetchStatus = useCallback(async (): Promise<ServerStatus | null> => {
    try {
      const res = await fetch("/api/ide/server");
      if (!res.ok) return null;
      return (await res.json()) as ServerStatus;
    } catch {
      return null;
    }
  }, []);

  const loadRecents = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace");
      if (!res.ok) return;
      const data = (await res.json()) as WorkspaceRecord[];
      if (mounted.current) setRecents(data);
    } catch {
      /* recents are non-critical */
    }
  }, []);

  // Resolve the current phase from the latest install + server snapshots.
  const settlePhase = useCallback((inst: InstallStatus, srv: ServerStatus | null) => {
    if (!mounted.current) return;
    setInstall(inst);
    setStatus(srv);
    if (!inst.installed) {
      setPhase("install");
    } else if (srv?.running) {
      // Folder is recovered from localStorage in the boot effect.
      setPhase("running");
    } else {
      setPhase("picker");
    }
  }, []);

  // ─── Boot: install check + server status + recents ─────
  useEffect(() => {
    (async () => {
      const [inst, srv] = await Promise.all([fetchInstall(), fetchStatus()]);
      if (!mounted.current) return;
      // Restore the last-launched folder so the embed/picker can prefill it.
      try {
        const saved = localStorage.getItem(LAST_FOLDER_KEY);
        if (saved) setFolder(saved);
      } catch {
        /* storage disabled — non-critical */
      }
      settlePhase(inst, srv);
      loadRecents();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rememberFolder = useCallback((path: string) => {
    setFolder(path);
    try {
      localStorage.setItem(LAST_FOLDER_KEY, path);
    } catch {
      /* storage disabled — non-critical */
    }
  }, []);

  // Re-check after a successful install.
  const handleInstalled = useCallback(async () => {
    const [inst, srv] = await Promise.all([fetchInstall(), fetchStatus()]);
    settlePhase(inst, srv);
  }, [fetchInstall, fetchStatus, settlePhase]);

  // ─── Polling until the server reports running ──────────
  const pollUntilRunning = useCallback(
    (tries: number) => {
      clearPoll();
      pollTimer.current = setTimeout(async () => {
        const srv = await fetchStatus();
        if (!mounted.current) return;
        if (srv?.running) {
          setStatus(srv);
          setPhase("running");
          setLaunching(false);
          return;
        }
        if (tries + 1 >= POLL_MAX_TRIES) {
          setLaunching(false);
          setPhase("picker");
          toast.error("VS Code did not start", "The server took too long to come up. Try again.");
          return;
        }
        pollUntilRunning(tries + 1);
      }, POLL_INTERVAL_MS);
    },
    [clearPoll, fetchStatus]
  );

  // ─── Launch a folder ───────────────────────────────────
  const launch = useCallback(
    async (rawPath: string) => {
      const path = rawPath.trim();
      if (!path) return;
      setLaunching(true);
      setPhase("starting");
      try {
        // 1. Validate / register the folder via the existing workspace endpoint.
        const wsRes = await fetch("/api/workspace", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path }),
        });
        if (!wsRes.ok) {
          const { error } = await wsRes.json().catch(() => ({ error: "Could not open folder" }));
          if (mounted.current) {
            toast.error("Could not open folder", error);
            setLaunching(false);
            setPhase("picker");
          }
          return;
        }
        const rec = (await wsRes.json()) as WorkspaceRecord;
        rememberFolder(rec.path);

        // 2. Ask the backend to start code-server pointed at that folder.
        const startRes = await fetch("/api/ide/server", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "start", folder: rec.path }),
        });
        const startData = (await startRes
          .json()
          .catch(() => ({ ok: false }))) as ServerActionResponse;
        if (!startRes.ok || !startData.ok) {
          if (mounted.current) {
            toast.error(
              "Could not start VS Code",
              startData.error ?? "The server failed to start."
            );
            setLaunching(false);
            setPhase("picker");
          }
          return;
        }

        // 3. If it is already running, embed immediately; otherwise poll.
        if (startData.status?.running) {
          if (!mounted.current) return;
          setStatus(startData.status);
          setPhase("running");
          setLaunching(false);
        } else {
          if (mounted.current) setStatus(startData.status ?? null);
          pollUntilRunning(0);
        }
        setPathInput("");
        loadRecents();
      } catch (err) {
        if (mounted.current) {
          toast.error("Could not start VS Code", err instanceof Error ? err.message : String(err));
          setLaunching(false);
          setPhase("picker");
        }
      }
    },
    [rememberFolder, pollUntilRunning, loadRecents]
  );

  const removeRecent = useCallback(async (id: string) => {
    try {
      await fetch(`/api/workspace/${id}`, { method: "DELETE" });
    } catch {
      /* non-critical */
    }
    if (mounted.current) setRecents((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // ─── Stop / restart the running server ─────────────────
  const handleStop = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/ide/server", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const srv = await fetchStatus();
      if (!mounted.current) return;
      setStatus(srv);
      setPhase(srv?.running ? "running" : "picker");
    } catch (err) {
      if (mounted.current) {
        toast.error("Could not stop VS Code", err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [fetchStatus]);

  const handleRestart = useCallback(async () => {
    if (!folder) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ide/server", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restart", folder }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as ServerActionResponse;
      if (!mounted.current) return;
      if (!res.ok || !data.ok) {
        toast.error("Could not restart VS Code", data.error ?? "The server failed to restart.");
        return;
      }
      if (data.status?.running) {
        setStatus(data.status);
        setPhase("running");
      } else {
        setStatus(data.status ?? null);
        setPhase("starting");
        setLaunching(true);
        pollUntilRunning(0);
      }
    } catch (err) {
      if (mounted.current) {
        toast.error("Could not restart VS Code", err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [folder, pollUntilRunning]);

  // ─── Render ────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="page-h grid place-items-center p-6">
        <div className="glass text-text-muted flex items-center gap-2.5 rounded-full border border-white/5 px-4 py-2.5 text-sm transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
          <Loader2 size={16} className="text-text-secondary animate-spin" /> Checking VS Code
          server…
        </div>
      </div>
    );
  }

  if (phase === "running" && status?.running) {
    return (
      <div className="page-h flex min-h-0 flex-col">
        <CodeServerEmbed
          url={status.url}
          folder={folder}
          name={folder ? basename(folder) : "Workspace"}
          onStop={handleStop}
          onRestart={handleRestart}
          busy={busy}
        />
      </div>
    );
  }

  if (phase === "starting") {
    return (
      <div className="page-h grid place-items-center p-6">
        <div className="glass flex items-center gap-2.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm text-emerald-300 shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
          <Loader2 size={16} className="animate-spin text-emerald-400" /> Starting VS Code…
        </div>
      </div>
    );
  }

  // install + picker share the centered single-column shell.
  return (
    <div className="page-h grid place-items-center p-6">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 inline-grid h-14 w-14 place-items-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10 shadow-[0_0_24px_-6px_rgba(52,211,153,0.6)]">
            <ServerCog size={24} className="text-emerald-300" />
          </div>
          <span className="eyebrow mb-3 inline-flex items-center gap-1.5">
            <Sparkles size={11} className="text-emerald-300" />
            Embedded editor
          </span>
          <h2 className="text-xl font-bold tracking-tight">Real VS Code in Matrix</h2>
          <p className="text-text-secondary mt-1 text-sm">
            Launch a full code-server workspace and use it right inside this tab.
          </p>
        </div>

        {phase === "install" ? (
          <CodeServerInstallPanel
            installed={install.installed}
            version={install.version}
            onInstalled={handleInstalled}
          />
        ) : (
          <>
            <div className="bezel sheen rounded-2xl p-1.5">
              <div className="bezel-core space-y-3 rounded-[calc(1.5rem-6px)] p-4">
                <label className="eyebrow block w-fit">Folder path</label>
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") launch(pathInput);
                    }}
                    placeholder="/Users/you/projects/my-app"
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="primary"
                    onClick={() => launch(pathInput)}
                    disabled={launching || !pathInput.trim()}
                    className="rounded-full transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]"
                  >
                    <Play size={14} /> {launching ? "Launching…" : "Launch in workspace"}
                  </Button>
                </div>
                <p className="text-text-muted text-[10px]">
                  Paste an absolute path. VS Code opens this folder as its workspace root.
                </p>
              </div>
            </div>

            {recents.length > 0 && (
              <div className="space-y-2.5">
                <p className="eyebrow inline-flex items-center gap-1.5">
                  <Clock size={11} className="text-emerald-300" /> Recent workspaces
                </p>
                <div className="space-y-1.5">
                  {recents.map((r) => (
                    <div
                      key={r.id}
                      className="group glass-input flex cursor-pointer items-center gap-3 rounded-xl border border-white/5 px-3 py-2.5 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-emerald-400/30 hover:bg-emerald-400/10 hover:shadow-[0_0_18px_-8px_rgba(52,211,153,0.6)] active:scale-[0.98]"
                      onClick={() => launch(r.path)}
                    >
                      <HardDrive
                        size={15}
                        className="text-text-muted shrink-0 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:text-emerald-300"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-text-primary truncate text-sm font-medium">{r.name}</p>
                        <p className="text-text-muted truncate font-mono text-[10px]">{r.path}</p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRecent(r.id);
                        }}
                        className="text-text-muted p-1 opacity-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100 hover:text-rose-400 active:scale-[0.9]"
                        aria-label="Remove from recents"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
