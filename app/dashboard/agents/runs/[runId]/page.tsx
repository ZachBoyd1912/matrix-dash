"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, XCircle, GitBranch, Undo2, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TranscriptRenderer } from "@/components/chat/transcript-renderer";
import { useRunStream } from "@/lib/hooks/use-run-stream";
import { toast } from "@/lib/stores/use-feedback";

interface GitMeta {
  gitBranch: string | null;
  gitRepoPath: string | null;
  prUrl: string | null;
  snapshotDir: string | null;
}

const STATUS_TONE: Record<string, string> = {
  succeeded: "bg-emerald-500/15 text-emerald-300",
  running: "bg-sky-500/15 text-sky-300",
  queued: "bg-white/10 text-text-muted",
  awaiting_approval: "bg-amber-500/15 text-amber-300",
  needs_review: "bg-amber-500/15 text-amber-300",
  failed: "bg-rose-500/15 text-rose-300",
  timeout: "bg-rose-500/15 text-rose-300",
  cancelled: "bg-white/10 text-text-muted",
  interrupted: "bg-white/10 text-text-muted",
};

const ACTIVE = new Set(["queued", "running", "awaiting_approval"]);

export default function RunViewPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const run = useRunStream(runId);
  const [git, setGit] = useState<GitMeta | null>(null);
  const [undoing, setUndoing] = useState(false);

  const isActive = ACTIVE.has(run.status);

  // Once the run is terminal, fetch git metadata for the Changes card.
  useEffect(() => {
    if (isActive) return;
    (async () => {
      const res = await fetch(`/api/agents/runs/${runId}`);
      if (res.ok) {
        const row = (await res.json()) as GitMeta;
        setGit(row);
      }
    })();
  }, [runId, isActive]);

  async function cancel() {
    await fetch(`/api/agents/runs/${runId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    toast.info("Cancel requested");
  }

  async function undo() {
    setUndoing(true);
    try {
      const res = await fetch(`/api/agents/runs/${runId}/undo`, { method: "POST" });
      const data = (await res.json()) as { restored?: number; deleted?: number; note?: string };
      toast.success(
        "Undo complete",
        data.note ?? `Restored ${data.restored ?? 0}, removed ${data.deleted ?? 0} file(s).`
      );
    } catch {
      toast.error("Undo failed");
    } finally {
      setUndoing(false);
    }
  }

  const hasChanges = !!(git && (git.gitBranch || git.prUrl || git.snapshotDir));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/dashboard/agents"
          className="text-text-muted hover:text-text-primary inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Agents
        </Link>
        {isActive && (
          <Button variant="danger" size="sm" onClick={cancel}>
            <XCircle className="mr-1.5 h-4 w-4" /> Cancel run
          </Button>
        )}
      </div>

      <Card className="flex flex-wrap items-center gap-4 p-4 text-sm">
        <Badge className={STATUS_TONE[run.status] ?? "bg-white/10"}>
          {run.status.replace(/_/g, " ")}
        </Badge>
        {run.connected && isActive && (
          <span className="text-text-muted inline-flex items-center gap-1.5 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" /> live
          </span>
        )}
        <span className="text-text-muted text-xs">
          {run.numTurns} turns · {run.inputTokens + run.outputTokens} tokens ·{" "}
          <span title="estimated (subscription auth)">${run.costUsd.toFixed(4)} est.</span>
        </span>
      </Card>

      {hasChanges && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            {git?.gitBranch && (
              <span className="text-text-muted inline-flex items-center gap-1.5 text-xs">
                <GitBranch className="h-3.5 w-3.5" /> {git.gitBranch}
              </span>
            )}
            {git?.prUrl && (
              <a
                href={git.prUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-sky-400 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Pull request
              </a>
            )}
            {!git?.gitBranch && !git?.prUrl && (
              <span className="text-text-muted text-xs">
                Non-repo changes (before-copies kept).
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" disabled={undoing} onClick={undo}>
            {undoing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Undo2 className="mr-1.5 h-4 w-4" />
            )}
            Undo file changes
          </Button>
        </Card>
      )}

      <Card className="p-4">
        {run.blocks.length === 0 ? (
          <div className="text-text-muted flex items-center gap-2 py-8 text-sm">
            {isActive ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Waiting for the agent to start…
              </>
            ) : (
              "No transcript recorded."
            )}
          </div>
        ) : (
          <TranscriptRenderer blocks={run.blocks} streaming={isActive} />
        )}
      </Card>
    </div>
  );
}
