export interface AppSettings {
  autoExtract: boolean;
  autoInject: boolean;
  maxInjectedMemories: number;
  systemPrompt: string;
  /** Stream extended-thinking/reasoning from providers that support it (Anthropic). */
  enableThinking: boolean;
  /** Ordered provider IDs tried, in order, if the requested/active provider's stream fails. */
  fallbackProviderIds: string[];
}

/**
 * Sampling/generation overrides passed straight through to streamText()'s and
 * generateText()'s CallSettings — field names match the AI SDK v5 option names
 * exactly (e.g. maxOutputTokens, not maxTokens) so no translation layer is needed
 * at the call sites. Every field is optional: an absent field means "use the
 * provider's own default," not zero.
 */
export interface GenerationParams {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stopSequences?: string[];
}

export const SETTING_DEFAULTS: Record<string, string> = {
  autoExtract: "1",
  autoInject: "1",
  maxInjectedMemories: "10",
  systemPrompt: "",
  enableThinking: "1",
  fallbackProviderIds: "[]",
  /** Local code-server (web VS Code) bind port. */
  ideServerPort: "3010",
  /** Auto-start code-server when the IDE page mounts ("1" on / "0" off). */
  ideServerAutoStart: "0",
  /** Coding-agent power level: "sandboxed" | "approval" | "unrestricted". */
  agent_power_level: "approval",
  /** Directory the coding tools operate within (empty → ~/MatrixDash). */
  agent_workspace_root: "",
  /** Path to the real Claude Code CLI binary (empty → "claude" on PATH). */
  claude_code_bin: "",
  /** ANTHROPIC_BASE_URL for Claude Code — point at claude-code-router to use any provider. */
  claude_code_base_url: "",
  /** Absolute path to an Obsidian vault on disk (empty → sync disabled). */
  obsidianVaultPath: "",
  /** Enable two-way sync between notes/memories and the Obsidian vault ("1" on / "0" off). */
  obsidianSyncEnabled: "0",
  /** Sync direction: "bidirectional" | "to-vault" | "from-vault". */
  obsidianSyncDirection: "bidirectional",
};
