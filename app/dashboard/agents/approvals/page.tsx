"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, Check, X, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { toast } from "@/lib/stores/use-feedback";

interface Approval {
  id: string;
  runId: string;
  agentId: string;
  agentName: string;
  toolName: string;
  summary: string;
  tier: "gated" | "break_glass";
  justification: string | null;
  input: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
}

export default function ApprovalsPage() {
  const [list, setList] = useState<Approval[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [alwaysAllow, setAlwaysAllow] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/agents/approvals");
    if (res.ok) setList((await res.json()) as Approval[]);
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function decide(a: Approval, decision: "approve" | "deny") {
    setBusy(a.id);
    try {
      const scope =
        decision === "approve" && alwaysAllow[a.id]
          ? a.toolName === "Bash"
            ? { commandPattern: typeof a.input.command === "string" ? a.input.command : undefined }
            : { pathPrefix: pathPrefixOf(a.input) }
          : undefined;
      const res = await fetch(`/api/agents/approvals/${a.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, alwaysAllow: scope }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not settle");
      }
      toast.success(decision === "approve" ? "Approved" : "Denied");
      void load();
    } catch (err) {
      toast.error("Failed", err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <Link
        href="/dashboard/agents"
        className="text-text-muted hover:text-text-primary inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Agents
      </Link>
      <h1 className="display flex items-center gap-2 text-2xl">
        <ShieldAlert className="h-6 w-6" /> Approvals
      </h1>

      {list === null ? (
        <div className="text-text-muted flex items-center gap-2 p-8 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8" />}
          title="Nothing pending"
          description="Gated agent actions will appear here for your approval."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((a) => (
            <Card
              key={a.id}
              className={`flex flex-col gap-3 p-4 ${a.tier === "break_glass" ? "border-rose-500/50" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/agents/${a.agentId}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {a.agentName}
                    </Link>
                    {a.tier === "break_glass" ? (
                      <Badge className="bg-rose-500/15 text-rose-300">break-glass</Badge>
                    ) : (
                      <Badge className="bg-amber-500/15 text-amber-300">gated</Badge>
                    )}
                    <Link
                      href={`/dashboard/agents/runs/${a.runId}`}
                      className="text-text-muted text-xs hover:underline"
                    >
                      view run
                    </Link>
                  </div>
                  <p className="mt-1 font-mono text-xs break-all">{a.summary}</p>
                  {a.justification && (
                    <p className="text-text-muted mt-1 text-xs italic">“{a.justification}”</p>
                  )}
                </div>
              </div>

              <label className="text-text-muted flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!!alwaysAllow[a.id]}
                  onChange={(e) => setAlwaysAllow((m) => ({ ...m, [a.id]: e.target.checked }))}
                />
                Always allow this {a.toolName === "Bash" ? "command" : "path"} for this agent
              </label>

              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === a.id}
                  onClick={() => decide(a, "deny")}
                >
                  <X className="mr-1 h-4 w-4" /> Deny
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy === a.id}
                  onClick={() => decide(a, "approve")}
                >
                  {busy === a.id ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-4 w-4" />
                  )}
                  Approve
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function pathPrefixOf(input: Record<string, unknown>): string | undefined {
  const p = (input.file_path ?? input.path ?? input.notebook_path) as string | undefined;
  if (!p) return undefined;
  // Offer the containing directory as the learned prefix.
  const idx = p.lastIndexOf("/");
  return idx > 0 ? p.slice(0, idx) : p;
}
