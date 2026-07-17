import { streamText, jsonSchema, tool, type ModelMessage, type ToolSet } from "ai";
import { getActiveProvider, resolveModel } from "@/lib/ai/registry";

export const dynamic = "force-dynamic";

/**
 * Built-in Anthropic-compatible `/v1/messages` endpoint. Matrix points the real
 * Claude Code CLI at this URL (via ANTHROPIC_BASE_URL) so Claude Code runs on the
 * user's ACTIVE Matrix provider/model — no claude-code-router to install. We
 * translate the Anthropic request into an AI SDK `streamText` call, then translate
 * the model output back into Anthropic SSE. Tools are passed through as definitions
 * only (no execute): the model emits tool_use, Claude Code runs the tool locally and
 * sends tool_result back on the next request — we just relay the format.
 */

interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}
interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicBlock[];
}
interface AnthropicBody {
  model?: string;
  messages?: AnthropicMessage[];
  system?: string | AnthropicBlock[];
  tools?: { name: string; description?: string; input_schema?: Record<string, unknown> }[];
  stream?: boolean;
}

function systemText(system: AnthropicBody["system"]): string {
  if (!system) return "";
  if (typeof system === "string") return system;
  return system.map((b) => b.text ?? "").join("\n");
}

function toModelMessages(body: AnthropicBody): ModelMessage[] {
  const out: ModelMessage[] = [];
  // Names by tool-call id so tool_result messages can name their call.
  const names = new Map<string, string>();
  for (const m of body.messages ?? []) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content } as ModelMessage);
      continue;
    }
    if (m.role === "assistant") {
      const parts: Record<string, unknown>[] = [];
      for (const b of m.content) {
        if (b.type === "text" && b.text) parts.push({ type: "text", text: b.text });
        else if (b.type === "tool_use" && b.id) {
          names.set(b.id, b.name ?? "tool");
          parts.push({
            type: "tool-call",
            toolCallId: b.id,
            toolName: b.name ?? "tool",
            input: b.input ?? {},
          });
        }
      }
      out.push({ role: "assistant", content: parts } as unknown as ModelMessage);
    } else {
      // user — may carry tool_result blocks (→ a tool message) and/or text.
      const toolParts: Record<string, unknown>[] = [];
      const textParts: Record<string, unknown>[] = [];
      for (const b of m.content) {
        if (b.type === "tool_result" && b.tool_use_id) {
          const text = typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "");
          toolParts.push({
            type: "tool-result",
            toolCallId: b.tool_use_id,
            toolName: names.get(b.tool_use_id) ?? "tool",
            output: b.is_error
              ? { type: "error-text", value: text }
              : { type: "text", value: text },
          });
        } else if (b.type === "text" && b.text) {
          textParts.push({ type: "text", text: b.text });
        }
      }
      if (toolParts.length)
        out.push({ role: "tool", content: toolParts } as unknown as ModelMessage);
      if (textParts.length)
        out.push({ role: "user", content: textParts } as unknown as ModelMessage);
    }
  }
  return out;
}

function buildTools(body: AnthropicBody): ToolSet | undefined {
  if (!body.tools?.length) return undefined;
  const set: ToolSet = {};
  for (const t of body.tools) {
    set[t.name] = tool({
      description: t.description ?? "",
      inputSchema: jsonSchema((t.input_schema as object) ?? { type: "object", properties: {} }),
      // No execute: relay tool_use back to Claude Code, which runs it locally.
    });
  }
  return set;
}

const enc = new TextEncoder();
const sse = (event: string, data: object) =>
  enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export async function POST(req: Request) {
  // The CLI subprocess can't carry a session cookie, so this path is exempt
  // from the middleware gate — the per-process secret (sent as the CLI's
  // ANTHROPIC_API_KEY → x-api-key header) is the auth instead. Without it,
  // this endpoint would be an open relay burning the owner's provider keys.
  const presented =
    req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const { getClaudeProxySecret } = await import("@/lib/services/claude-code");
  if (!presented || presented !== getClaudeProxySecret()) {
    return Response.json(
      { type: "error", error: { type: "authentication_error", message: "Invalid proxy key" } },
      { status: 401 }
    );
  }

  let body: AnthropicBody;
  try {
    body = (await req.json()) as AnthropicBody;
  } catch {
    return Response.json(
      { type: "error", error: { type: "invalid_request_error", message: "Invalid JSON" } },
      { status: 400 }
    );
  }

  const provider = getActiveProvider();
  if (!provider) {
    return Response.json(
      {
        type: "error",
        error: {
          type: "api_error",
          message: "No active Matrix provider. Add one in Settings → Add Models.",
        },
      },
      { status: 503 }
    );
  }

  // Fold the Anthropic system prompt into the first user turn — safe across every
  // provider SDK (some openai-compat endpoints reject a system/developer role).
  const messages = toModelMessages(body);
  const sys = systemText(body.system);
  if (sys) {
    const i = messages.findIndex((m) => m.role === "user" && typeof m.content === "string");
    if (i >= 0)
      messages[i] = { role: "user", content: `${sys}\n\n———\n\n${messages[i].content as string}` };
    else messages.unshift({ role: "user", content: sys });
  }

  let result;
  try {
    // Always run the user's ACTIVE Matrix provider/model. We IGNORE the model name
    // Claude Code sends — it's always a Claude id (e.g. "claude-opus-4-7") that other
    // providers reject. The user chooses the model in Matrix.
    result = streamText({ model: resolveModel(provider), messages, tools: buildTools(body) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { type: "error", error: { type: "api_error", message: msg } },
      { status: 500 }
    );
  }

  const msgId = `msg_${provider.id.slice(0, 8)}${Date.now().toString(36)}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let index = -1;
      let textOpen = false;
      let sawTool = false;
      const closeText = () => {
        if (textOpen) {
          controller.enqueue(sse("content_block_stop", { type: "content_block_stop", index }));
          textOpen = false;
        }
      };
      controller.enqueue(
        sse("message_start", {
          type: "message_start",
          message: {
            id: msgId,
            type: "message",
            role: "assistant",
            model: provider.defaultModel ?? "matrix",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        })
      );
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            if (!textOpen) {
              index++;
              textOpen = true;
              controller.enqueue(
                sse("content_block_start", {
                  type: "content_block_start",
                  index,
                  content_block: { type: "text", text: "" },
                })
              );
            }
            controller.enqueue(
              sse("content_block_delta", {
                type: "content_block_delta",
                index,
                delta: { type: "text_delta", text: part.text },
              })
            );
          } else if (part.type === "tool-call") {
            closeText();
            sawTool = true;
            index++;
            controller.enqueue(
              sse("content_block_start", {
                type: "content_block_start",
                index,
                content_block: {
                  type: "tool_use",
                  id: part.toolCallId,
                  name: part.toolName,
                  input: {},
                },
              })
            );
            controller.enqueue(
              sse("content_block_delta", {
                type: "content_block_delta",
                index,
                delta: { type: "input_json_delta", partial_json: JSON.stringify(part.input ?? {}) },
              })
            );
            controller.enqueue(sse("content_block_stop", { type: "content_block_stop", index }));
          }
        }
        closeText();
        controller.enqueue(
          sse("message_delta", {
            type: "message_delta",
            delta: { stop_reason: sawTool ? "tool_use" : "end_turn", stop_sequence: null },
            usage: { output_tokens: 1 },
          })
        );
        controller.enqueue(sse("message_stop", { type: "message_stop" }));
      } catch (e) {
        controller.enqueue(
          sse("error", {
            type: "error",
            error: { type: "api_error", message: e instanceof Error ? e.message : String(e) },
          })
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
    },
  });
}
