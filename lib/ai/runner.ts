import { generateText, stepCountIs } from "ai";
import { getActiveProvider, resolveModel } from "./registry";
import { buildAgentTools } from "./tools";
import { buildMemoryContext } from "./injection";

/**
 * Run a single prompt through the agent loop (non-streaming). Used by the
 * scheduler and webhooks. Returns the final text, or throws if no provider.
 */
export async function runAgent(prompt: string, opts?: { useTools?: boolean }): Promise<string> {
  const provider = getActiveProvider();
  if (!provider) throw new Error("No active AI provider");

  const model = resolveModel(provider);
  const memoryContext = buildMemoryContext(prompt);
  const system = [
    "You are Jarvis, an autonomous personal assistant running a scheduled job. Use your tools to gather what you need, then produce a concise, useful result for the user.",
    memoryContext,
  ]
    .filter(Boolean)
    .join("\n\n");

  const useTools = opts?.useTools !== false;
  const { text } = await generateText({
    model,
    system,
    prompt,
    tools: useTools ? buildAgentTools() : undefined,
    stopWhen: useTools ? stepCountIs(8) : undefined,
  });
  return text;
}
