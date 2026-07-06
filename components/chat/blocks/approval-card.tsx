"use client";

import { useState } from "react";
import { ShieldAlert, Check, X } from "lucide-react";
import type { Block, ApprovalDecision } from "@/lib/chat/blocks";

type ApprovalBlock = Extract<Block, { kind: "approval" }>;

function summarize(block: ApprovalBlock): string {
  if (block.summary) return block.summary;
  const a = block.args as Record<string, unknown> | undefined;
  if (a && typeof a.command === "string") return `Run: ${a.command}`;
  if (a && typeof a.path === "string") return `${block.name} ${a.path}`;
  return block.name;
}

/**
 * Inline Allow / Allow-always / Deny card for a paused tool. Clicking POSTs the
 * decision (via onDecide → /api/ai/approve), which resumes the held tool in the
 * open stream; the card then flips to its resolved state when the server's
 * `approval_resolved` event updates the block.
 */
export function ApprovalCard({
  block,
  onDecide,
}: {
  block: ApprovalBlock;
  onDecide: (id: string, decision: ApprovalDecision) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const decide = (d: ApprovalDecision) => {
    setSubmitting(true);
    onDecide(block.id, d);
  };

  if (block.status !== "pending") {
    const denied = block.status === "denied";
    return (
      <div className="text-text-muted my-2 flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 font-mono text-[11px]">
        {denied ? (
          <X size={12} className="text-rose-400" />
        ) : (
          <Check size={12} className="text-emerald-400" />
        )}
        {denied ? "Denied" : "Allowed"} · {block.name}
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3 shadow-[0_0_28px_-10px_rgba(251,191,36,0.55)] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
      <div className="mb-2 flex items-center gap-2">
        <ShieldAlert size={13} className="text-amber-300" />
        <span className="text-text-primary text-[12px] font-semibold">Approval required</span>
        <span className="text-text-muted ml-auto font-mono text-[10px]">{block.name}</span>
      </div>
      <pre className="mb-3 overflow-x-auto rounded-lg border border-white/5 bg-black/40 px-3 py-2 font-mono text-[11px] break-words whitespace-pre-wrap text-emerald-200/90">
        {summarize(block)}
      </pre>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => decide("allow")}
          className="h-8 rounded-lg bg-emerald-400 px-3 text-[12px] font-medium text-black shadow-[0_0_22px_-4px_rgba(52,211,153,0.7)] transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-emerald-300 active:scale-[0.98] disabled:opacity-50"
        >
          Allow
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => decide("allow_always")}
          className="h-8 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 text-[12px] font-medium text-emerald-300 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-emerald-400/15 active:scale-[0.98] disabled:opacity-50"
        >
          Allow always
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => decide("deny")}
          className="ml-auto h-8 rounded-lg border border-transparent px-3 text-[12px] font-medium text-rose-300 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-rose-500/30 hover:bg-rose-500/10 active:scale-[0.98] disabled:opacity-50"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
