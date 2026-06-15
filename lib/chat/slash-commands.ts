export interface SlashCommand {
  name: string;
  description: string;
}

/**
 * Slash commands surfaced in the chat input's "/" menu. `clear` is handled
 * client-side (resets the transcript); the rest are sent to the OpenClaude engine
 * as the prompt, which interprets them.
 */
export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "clear", description: "Clear the conversation" },
  { name: "compact", description: "Summarize & compact the conversation" },
  { name: "init", description: "Analyze the project & write a memory file" },
  { name: "review", description: "Review code changes" },
  { name: "context", description: "Show context usage" },
  { name: "usage", description: "Show token usage & cost" },
  { name: "model", description: "Switch the model" },
  { name: "agents", description: "Manage agents" },
  { name: "mcp", description: "Manage MCP servers" },
  { name: "memory", description: "Edit project memory" },
  { name: "permissions", description: "Manage tool permissions" },
  { name: "help", description: "Show available commands" },
];
