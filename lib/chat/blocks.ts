/**
 * Canonical transcript model shared by the chat stream (server), the streaming
 * reducer (client), and persistence/hydration.
 *
 * An assistant turn is no longer a flat string — it is an ordered list of typed
 * `Block`s (text · reasoning · tool_call · todo · approval · error) so the UI can
 * render an interleaved Claude-Code-style timeline. The server emits `StreamEvent`
 * NDJSON lines; `appendEvent` folds them into `Block[]` in arrival order.
 *
 * Isomorphic on purpose (no "use client", no Node imports) so the same reducer is
 * reused on the client during streaming and on hydration of a saved session.
 */

export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export type ToolStatus = "running" | "done" | "error";
export type ApprovalStatus = "pending" | "allowed" | "denied";
export type ApprovalDecision = "allow" | "allow_always" | "deny";

export type Block =
  | { kind: "text"; text: string }
  | { kind: "reasoning"; text: string }
  | {
      kind: "tool_call";
      id: string;
      name: string;
      args: unknown;
      status: ToolStatus;
      result?: unknown;
      error?: string;
    }
  | { kind: "todo"; items: TodoItem[] }
  | {
      kind: "approval";
      id: string;
      name: string;
      args: unknown;
      summary?: string;
      status: ApprovalStatus;
    }
  | { kind: "error"; text: string };

/** One NDJSON object per line on the wire. Legacy text/reasoning/error kept verbatim. */
export type StreamEvent =
  | { type: "text"; value: string }
  | { type: "reasoning"; value: string }
  | { type: "error"; value: string }
  | { type: "tool_call"; id: string; name: string; args?: unknown }
  | { type: "tool_result"; id: string; name?: string; result?: unknown; error?: string }
  | { type: "todo"; items: TodoItem[] }
  | { type: "approval_request"; id: string; name: string; args?: unknown; summary?: string }
  | { type: "approval_resolved"; id: string; decision: ApprovalDecision }
  | { type: "notice"; value: string }
  | {
      type: "usage";
      value: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    }
  /** Which provider actually served this turn, once the fallback cascade committed to one. */
  | { type: "provider_used"; id: string; name: string; fellBack: boolean };

/**
 * Fold one stream event into the block list in arrival order. Mutates `blocks` and
 * `idMap` for efficiency during streaming (callers pass a fresh array reference to
 * React each tick). `idMap` maps a tool/approval id → its block index so out-of-order
 * results patch the right block.
 *
 * `notice`/`usage` are not transcript blocks (the client handles them out-of-band) —
 * they fall through to the no-op default.
 */
export function appendEvent(blocks: Block[], idMap: Map<string, number>, ev: StreamEvent): Block[] {
  const last = blocks[blocks.length - 1];
  switch (ev.type) {
    case "text":
      if (last && last.kind === "text") last.text += ev.value;
      else blocks.push({ kind: "text", text: ev.value });
      return blocks;
    case "reasoning":
      if (last && last.kind === "reasoning") last.text += ev.value;
      else blocks.push({ kind: "reasoning", text: ev.value });
      return blocks;
    case "tool_call":
      idMap.set(ev.id, blocks.length);
      blocks.push({
        kind: "tool_call",
        id: ev.id,
        name: ev.name,
        args: ev.args,
        status: "running",
      });
      return blocks;
    case "tool_result": {
      const i = idMap.get(ev.id);
      const b = i != null ? blocks[i] : undefined;
      if (b && b.kind === "tool_call") {
        b.status = ev.error ? "error" : "done";
        if (ev.result !== undefined) b.result = ev.result;
        if (ev.error) b.error = ev.error;
      }
      return blocks;
    }
    case "todo": {
      const i = blocks.findIndex((b) => b.kind === "todo");
      if (i >= 0) (blocks[i] as Extract<Block, { kind: "todo" }>).items = ev.items;
      else blocks.push({ kind: "todo", items: ev.items });
      return blocks;
    }
    case "approval_request":
      idMap.set(ev.id, blocks.length);
      blocks.push({
        kind: "approval",
        id: ev.id,
        name: ev.name,
        args: ev.args,
        summary: ev.summary,
        status: "pending",
      });
      return blocks;
    case "approval_resolved": {
      const i = idMap.get(ev.id);
      const b = i != null ? blocks[i] : undefined;
      if (b && b.kind === "approval") b.status = ev.decision === "deny" ? "denied" : "allowed";
      return blocks;
    }
    case "error":
      blocks.push({ kind: "error", text: ev.value });
      return blocks;
    default:
      return blocks;
  }
}

/** Concatenate the rendered text of a turn — for TTS, persistence, and search. */
export function blocksToText(blocks: Block[]): string {
  return blocks
    .filter((b): b is Extract<Block, { kind: "text" }> => b.kind === "text")
    .map((b) => b.text)
    .join("");
}

/** Wrap a legacy `content` string (saved rows) as a single text block. */
export function textToBlocks(content: string): Block[] {
  return content ? [{ kind: "text", text: content }] : [];
}

const STORE_CAP = 6000;

function capForStorage(value: unknown): unknown {
  if (value == null) return value;
  const s = typeof value === "string" ? value : safeStringify(value);
  if (s.length <= STORE_CAP) return value;
  return s.slice(0, STORE_CAP) + "\n…[truncated]";
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Serialize a turn's blocks for the `session_messages.blocks` column, capping
 * large tool outputs so a runaway result can't bloat the row.
 */
export function serializeBlocksForStorage(blocks: Block[]): string {
  const capped = blocks.map((b) =>
    b.kind === "tool_call"
      ? {
          ...b,
          result: capForStorage(b.result),
          error: b.error ? b.error.slice(0, STORE_CAP) : b.error,
        }
      : b
  );
  return JSON.stringify(capped);
}

/** Parse a persisted `blocks` JSON string, falling back to `null` on any error. */
export function parseBlocksJson(json: string | null | undefined): Block[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Block[]) : null;
  } catch {
    return null;
  }
}
