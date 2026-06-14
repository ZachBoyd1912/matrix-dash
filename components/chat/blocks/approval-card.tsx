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
      <div className="my-2 flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] text-[11px] font-mono text-text-muted">
        {denied ? <X size={12} className="text-rose-400" /> : <Check size={12} className="text-emerald-400" />}
        {denied ? "Denied" : "Allowed"} · {block.name}
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] shadow-[0_0_28px_-10px_rgba(251,191,36,0.55)] p-3 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert size={13} className="text-amber-300" />
        <span className="text-[12px] font-semibold text-text-primary">Approval required</span>
        <span className="ml-auto text-[10px] font-mono text-text-muted">{block.name}</span>
      </div>
      <pre className="rounded-lg bg-black/40 border border-white/5 px-3 py-2 text-[11px] font-mono text-emerald-200/90 overflow-x-auto whitespace-pre-wrap break-words mb-3">
        {summarize(block)}
      </pre>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => decide("allow")}
          className="h-8 px-3 rounded-lg text-[12px] font-medium bg-emerald-400 text-black shadow-[0_0_22px_-4px_rgba(52,211,153,0.7)] hover:bg-emerald-300 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] disabled:opacity-50"
        >
          Allow
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => decide("allow_always")}
          className="h-8 px-3 rounded-lg text-[12px] font-medium text-emerald-300 border border-emerald-400/30 bg-emerald-400/10 hover:bg-emerald-400/15 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] disabled:opacity-50"
        >
          Allow always
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => decide("deny")}
          className="h-8 px-3 rounded-lg text-[12px] font-medium text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] ml-auto disabled:opacity-50"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
