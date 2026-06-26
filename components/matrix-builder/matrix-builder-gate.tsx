"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Blocks, ExternalLink, Loader2, Play, Sparkles } from "lucide-react";
import { MatrixBuilderEmbed } from "./matrix-builder-embed";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/stores/use-feedback";

interface BuilderStatus {
  running: boolean;
  port: number;
  url: string;
  dir: string;
  dirExists: boolean;
  pid?: number;
}

interface ActionResponse {
  ok: boolean;
  status?: BuilderStatus;
  error?: string;
}

type Phase = "loading" | "starting" | "running" | "error";

const POLL_INTERVAL_MS = 1500;
// ~2 min: the builder's Vite/Remix dev server can be slow to boot on first start.
const POLL_MAX_TRIES = 80;

const FALLBACK_URL =
  process.env.NEXT_PUBLIC_MATRIX_BUILDER_URL ?? "http://localhost:5001";

/**
 * Orchestrates the Matrix Builder lifecycle for its dashboard tab: forces the
 * host document to be cross-origin isolated (the scoped COOP/COEP headers only
 * apply on a full load, which Next soft-nav skips), then auto-starts the builder
 * dev server on demand, polls until it's reachable, and embeds it. Opening the
 * tab "just works" — no separate terminal needed.
 */
export default function MatrixBuilderGate() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState<BuilderStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const fetchStatus = useCallback(async (): Promise<BuilderStatus | null> => {
    try {
      const res = await fetch("/api/matrix-builder/server");
      if (!res.ok) return null;
      return (await res.json()) as BuilderStatus;
    } catch {
      return null;
    }
  }, []);

  // Poll until the dev server answers, then embed; bail out with an error after
  // POLL_MAX_TRIES so a broken start doesn't spin forever.
  const pollUntilRunning = useCallback(
    (tries: number) => {
      clearPoll();
      pollTimer.current = setTimeout(async () => {
        const srv = await fetchStatus();
        if (!mounted.current) return;
        if (srv?.running) {
          setStatus(srv);
          setPhase("running");
          return;
        }
        if (tries + 1 >= POLL_MAX_TRIES) {
          setErrorMsg("Matrix Builder did not come up in time. Check its dev log or open it in a new tab.");
          setPhase("error");
          return;
        }
        pollUntilRunning(tries + 1);
      }, POLL_INTERVAL_MS);
    },
    [clearPoll, fetchStatus]
  );

  const start = useCallback(async () => {
    setErrorMsg(null);
    setPhase("starting");
    try {
      const res = await fetch("/api/matrix-builder/server", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as ActionResponse;
      if (!mounted.current) return;
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? "Could not start Matrix Builder.");
        setPhase("error");
        return;
      }
      if (data.status?.running) {
        setStatus(data.status);
        setPhase("running");
      } else {
        if (data.status) setStatus(data.status);
        pollUntilRunning(0);
      }
    } catch (err) {
      if (mounted.current) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    }
  }, [pollUntilRunning]);

  // ─── Boot: ensure isolation, then auto-start ───────────
  useEffect(() => {
    // The embedded WebContainer needs SharedArrayBuffer, granted only when this
    // host document is cross-origin isolated. The scoped COOP/COEP headers only
    // take effect on a *full* document load — a Next soft-nav from another sidebar
    // route lands here with crossOriginIsolated === false. Force one hard reload
    // to re-fetch this document with its headers (session-guarded against loops).
    const RELOAD_GUARD = "matrixBuilderCoiReload";
    if (typeof window !== "undefined" && !window.crossOriginIsolated) {
      if (!sessionStorage.getItem(RELOAD_GUARD)) {
        sessionStorage.setItem(RELOAD_GUARD, "1");
        window.location.reload();
        return;
      }
    } else if (typeof window !== "undefined") {
      sessionStorage.removeItem(RELOAD_GUARD);
    }

    // Use an effect-local cancel flag, NOT the shared `mounted` ref: React Strict
    // Mode (dev) double-invokes this effect, and the shared ref's cleanup can read
    // false mid-flight and permanently swallow this first state update. A per-run
    // flag means only the superseded run bails; the live run always completes.
    let cancelled = false;
    (async () => {
      const srv = await fetchStatus();
      if (cancelled) return;
      if (srv) setStatus(srv);
      if (srv?.running) {
        setPhase("running");
      } else {
        // Auto-start the moment the tab opens.
        start();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStop = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/matrix-builder/server", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const srv = await fetchStatus();
      if (!mounted.current) return;
      setStatus(srv);
      if (srv?.running) {
        setPhase("running");
      } else {
        setErrorMsg(null);
        setPhase("error");
        setErrorMsg("Matrix Builder is stopped.");
      }
    } catch (err) {
      if (mounted.current) {
        toast.error("Could not stop Matrix Builder", err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [fetchStatus]);

  const handleRestart = useCallback(async () => {
    setBusy(true);
    setPhase("starting");
    try {
      const res = await fetch("/api/matrix-builder/server", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restart" }),
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as ActionResponse;
      if (!mounted.current) return;
      if (!res.ok || !data.ok) {
        toast.error("Could not restart Matrix Builder", data.error ?? "The dev server failed to restart.");
      }
      if (data.status?.running) {
        setStatus(data.status);
        setPhase("running");
      } else {
        if (data.status) setStatus(data.status);
        pollUntilRunning(0);
      }
    } catch (err) {
      if (mounted.current) {
        toast.error("Could not restart Matrix Builder", err instanceof Error ? err.message : String(err));
        setPhase("error");
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [pollUntilRunning]);

  // ─── Render ────────────────────────────────────────────
  if (phase === "running" && status?.running) {
    return (
      <div className="page-h flex flex-col min-h-0">
        <MatrixBuilderEmbed
          url={status.url}
          onStop={handleStop}
          onRestart={handleRestart}
          busy={busy}
        />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="page-h grid place-items-center p-6">
        <div className="w-full max-w-md text-center space-y-5">
          <div className="inline-grid place-items-center h-14 w-14 rounded-2xl bg-amber-400/10 border border-amber-400/30 shadow-[0_0_24px_-6px_rgba(251,191,36,0.5)]">
            <AlertTriangle size={24} className="text-amber-300" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Matrix Builder isn&apos;t running</h2>
            <p className="text-text-secondary text-sm mt-1">
              {errorMsg ?? "The Matrix Builder dev server could not be reached."}
            </p>
            {status?.dir && (
              <p className="text-[10px] text-text-muted font-mono mt-2 break-all">{status.dir}</p>
            )}
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button variant="primary" onClick={start} className="rounded-full">
              <Play size={14} /> Start Matrix Builder
            </Button>
            <a
              href={FALLBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full glass-input text-xs text-text-secondary hover:text-emerald-400 hover:border-white/15 transition-colors"
            >
              <ExternalLink size={14} /> Open in new tab
            </a>
          </div>
        </div>
      </div>
    );
  }

  // loading + starting share a centered spinner.
  return (
    <div className="page-h grid place-items-center p-6">
      <div className="flex flex-col items-center text-center gap-4">
        <span className="relative grid place-items-center h-14 w-14 rounded-2xl bg-emerald-400/10 border border-emerald-400/30 shadow-[0_0_24px_-6px_rgba(52,211,153,0.6)]">
          <Blocks size={24} className="text-emerald-300" />
        </span>
        <div className="glass rounded-full px-4 py-2.5 flex items-center gap-2.5 text-sm border border-white/5">
          <Loader2 size={16} className="animate-spin text-emerald-400" />
          {phase === "starting" ? "Starting Matrix Builder…" : "Connecting to Matrix Builder…"}
        </div>
        <p className="eyebrow inline-flex items-center gap-1.5 text-text-muted">
          <Sparkles size={11} className="text-emerald-300" /> First boot can take a moment
        </p>
      </div>
    </div>
  );
}
