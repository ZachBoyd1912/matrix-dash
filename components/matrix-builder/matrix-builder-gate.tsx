"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BuilderMark } from "@/components/layout/logo";

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

type Phase = "loading" | "starting" | "ready" | "error";

const POLL_INTERVAL_MS = 1500;
// ~2 min: the builder's Vite/Remix dev server can be slow to boot on first start.
const POLL_MAX_TRIES = 80;

const FALLBACK_URL =
  process.env.NEXT_PUBLIC_MATRIX_BUILDER_URL ?? "http://localhost:5001";

function LaunchLink({ url, primary }: { url: string; primary?: boolean }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={
        primary
          ? "inline-flex items-center gap-2 px-4 h-10 rounded-full bg-emerald-400 text-black text-sm font-semibold hover:bg-emerald-300 transition-colors"
          : "inline-flex items-center gap-1.5 px-3 h-9 rounded-full glass-input text-xs text-text-secondary hover:text-emerald-400 hover:border-white/15 transition-colors"
      }
    >
      <ExternalLink size={primary ? 15 : 14} /> Open Matrix Builder
    </a>
  );
}

/**
 * Matrix Builder is a separate Cloudflare Access-gated app and can't be framed —
 * Access's own login page sends a hardcoded frame-ancestors policy that blocks
 * any iframe embed once a fresh login is needed (which recurs on every session
 * expiry). So this tab is a status/launch panel, not an embed: it checks whether
 * the builder is reachable (and starts it for local dev if not), then hands off
 * via a real top-level navigation, which is never subject to frame-ancestors.
 */
export default function MatrixBuilderGate() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState<BuilderStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  // Poll until the dev server answers; bail out with an error after
  // POLL_MAX_TRIES so a broken start doesn't spin forever.
  const pollUntilRunning = useCallback(
    (tries: number) => {
      clearPoll();
      pollTimer.current = setTimeout(async () => {
        const srv = await fetchStatus();
        if (!mounted.current) return;
        if (srv?.running) {
          setStatus(srv);
          setPhase("ready");
          return;
        }
        if (tries + 1 >= POLL_MAX_TRIES) {
          setErrorMsg("Matrix Builder did not come up in time. You can still try opening it directly.");
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
        setPhase("ready");
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

  // ─── Boot: check status, auto-start if needed ───────────
  useEffect(() => {
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
        setPhase("ready");
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

  const launchUrl = status?.url || FALLBACK_URL;

  // ─── Render ────────────────────────────────────────────
  if (phase === "ready" && status) {
    return (
      <div className="page-h grid place-items-center p-6">
        <div className="w-full max-w-md text-center space-y-5">
          <div className="inline-grid place-items-center h-14 w-14 rounded-2xl bg-emerald-400/10 border border-emerald-400/30 shadow-[0_0_24px_-6px_rgba(52,211,153,0.6)]">
            <BuilderMark size={28} />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Matrix Builder is running</h2>
            <p className="text-text-secondary text-sm mt-1">
              It opens in a new tab — Cloudflare Access protects it separately from the dashboard.
            </p>
          </div>
          <div className="flex items-center justify-center">
            <LaunchLink url={launchUrl} primary />
          </div>
        </div>
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
            <h2 className="text-lg font-bold tracking-tight">Couldn&apos;t confirm Matrix Builder locally</h2>
            <p className="text-text-secondary text-sm mt-1">
              {errorMsg ?? "The Matrix Builder server could not be reached."}
            </p>
            {status?.dir && (
              <p className="text-[10px] text-text-muted font-mono mt-2 break-all">{status.dir}</p>
            )}
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button variant="primary" onClick={start} className="rounded-full">
              <Play size={14} /> Try starting it
            </Button>
            <LaunchLink url={launchUrl} />
          </div>
        </div>
      </div>
    );
  }

  // loading + starting share a centered spinner. The launch link stays available
  // even here — the local probe can't see through Cloudflare, so it should never
  // be the only way to reach the builder.
  return (
    <div className="page-h grid place-items-center p-6">
      <div className="flex flex-col items-center text-center gap-4">
        <span className="relative grid place-items-center h-14 w-14 rounded-2xl bg-emerald-400/10 border border-emerald-400/30 shadow-[0_0_24px_-6px_rgba(52,211,153,0.6)]">
          <BuilderMark size={28} />
        </span>
        <div className="glass rounded-full px-4 py-2.5 flex items-center gap-2.5 text-sm border border-white/5">
          <Loader2 size={16} className="animate-spin text-emerald-400" />
          {phase === "starting" ? "Starting Matrix Builder…" : "Checking Matrix Builder…"}
        </div>
        <p className="eyebrow inline-flex items-center gap-1.5 text-text-muted">
          <Sparkles size={11} className="text-emerald-300" /> First boot can take a moment
        </p>
        <LaunchLink url={launchUrl} />
      </div>
    </div>
  );
}
