"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { appendEvent, type Block, type StreamEvent } from "@/lib/chat/blocks";

export interface RunStreamState {
  status: string;
  blocks: Block[];
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  numTurns: number;
  connected: boolean;
}

interface HydrateFrame {
  __control: "hydrate";
  status: string;
  blocks: Block[];
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  numTurns: number;
}

const TERMINAL = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "timeout",
  "interrupted",
  "needs_review",
]);

/**
 * Consumes an agent run's NDJSON stream. The first frame is a `hydrate` control
 * frame (persisted blocks + status); subsequent lines are StreamEvents folded
 * into the block list via the same `appendEvent` reducer the chat client uses.
 */
export function useRunStream(runId: string): RunStreamState {
  const [state, setState] = useState<RunStreamState>({
    status: "queued",
    blocks: [],
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    numTurns: 0,
    connected: false,
  });
  const blocksRef = useRef<Block[]>([]);
  const idMapRef = useRef<Map<string, number>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      try {
        const res = await fetch(`/api/agents/runs/${runId}/stream`, { signal: ac.signal });
        if (!res.ok || !res.body) return;
        setState((s) => ({ ...s, connected: true }));
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n");
          buf = parts.pop() ?? "";
          for (const p of parts) {
            if (!p.trim()) continue;
            let obj: HydrateFrame | StreamEvent;
            try {
              obj = JSON.parse(p) as HydrateFrame | StreamEvent;
            } catch {
              continue;
            }
            if ("__control" in obj && obj.__control === "hydrate") {
              blocksRef.current = obj.blocks.slice();
              idMapRef.current = rebuildIdMap(obj.blocks);
              setState((s) => ({
                ...s,
                status: obj.status,
                blocks: blocksRef.current.slice(),
                costUsd: obj.costUsd,
                inputTokens: obj.inputTokens,
                outputTokens: obj.outputTokens,
                numTurns: obj.numTurns,
              }));
              continue;
            }
            const ev = obj as StreamEvent;
            if (ev.type === "usage") {
              setState((s) => ({
                ...s,
                inputTokens: ev.value.inputTokens ?? s.inputTokens,
                outputTokens: ev.value.outputTokens ?? s.outputTokens,
              }));
              continue;
            }
            appendEvent(blocksRef.current, idMapRef.current, ev);
            setState((s) => ({ ...s, blocks: blocksRef.current.slice() }));
          }
        }
      } catch {
        /* aborted / network */
      } finally {
        if (abortRef.current === ac) setState((s) => ({ ...s, connected: false }));
      }
    })();
  }, [runId]);

  useEffect(() => {
    start();
    return () => abortRef.current?.abort();
  }, [start]);

  // Poll the run row for terminal status/cost once the live stream closes,
  // since final token/cost totals are written at the very end.
  useEffect(() => {
    if (TERMINAL.has(state.status)) return;
    if (state.connected) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/agents/runs/${runId}`);
        if (!res.ok) return;
        const row = (await res.json()) as {
          status: string;
          costUsd: number;
          inputTokens: number;
          outputTokens: number;
          numTurns: number;
        };
        setState((s) => ({
          ...s,
          status: row.status,
          costUsd: row.costUsd,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          numTurns: row.numTurns,
        }));
        if (TERMINAL.has(row.status)) clearInterval(t);
      } catch {
        /* ignore */
      }
    }, 2500);
    return () => clearInterval(t);
  }, [runId, state.status, state.connected]);

  return state;
}

function rebuildIdMap(blocks: Block[]): Map<string, number> {
  const map = new Map<string, number>();
  blocks.forEach((b, i) => {
    if (b.kind === "tool_call" || b.kind === "approval") map.set(b.id, i);
  });
  return map;
}
