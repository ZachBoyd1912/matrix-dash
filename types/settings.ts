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

  // ─── Agent system ────────────────────────────────────────
  /** Global emergency stop — when "1", queued runs don't start and active runs are aborted. */
  agents_kill_switch: "0",
  /** Max agent runs executing at once (clamped to 1 on low-RAM hosts). */
  agents_max_concurrent: "1",
  /** Default per-run turn cap when an agent has no override. */
  agents_default_max_turns: "30",
  /** Default per-run wall-clock timeout in minutes. */
  agents_run_timeout_min: "30",
  /** Daily spend ceiling (USD, estimated) across all runs; queue pauses past it. */
  agents_daily_cost_budget_usd: "10",
  /** Daily token ceiling across all runs; queue pauses past it. */
  agents_daily_token_budget: "2000000",
  /** Minutes a pending approval waits before auto-denying. */
  agents_approval_timeout_min: "60",
  /** JSON string[] of extra denylist path globs / bash patterns. */
  agents_denylist_extra: "[]",
  /** Email address for run-failure / pending-approval / digest notifications. */
  agents_notify_email: "",
  /** Absolute path to the agent-system source repo (self-modification guard). */
  agents_self_path: "/Users/zach/Desktop/matrix-dash",
  /** Days before a run's before-copy snapshot dir is pruned. */
  agents_snapshot_retention_days: "30",
  /** Send the daily agent digest email ("1" on / "0" off). */
  agents_digest_enabled: "1",
  /** Max runtime agent-chaining depth before a run needs break-glass approval. */
  agents_max_chain_depth: "3",
  /** Percent of the rolling-5h usage window at which cron/webhook runs soft-pause. */
  agents_usage_buffer_pct: "80",
  /** Consecutive failures before a scheduled agent auto-disables its schedule. */
  agents_failure_disable_threshold: "3",
  /** Quiet-hours window (24h "HH:MM"); routine notifications suppressed, urgent breaks through. */
  agents_quiet_hours_start: "",
  agents_quiet_hours_end: "",
  /** Days an agent-opened PR may stay open before the digest nudges about it. */
  agents_stale_pr_days: "7",

  // ─── Voice (Jarvis) ──────────────────────────────────────
  /** Master voice toggle ("1" on / "0" off; off → browser-engine fallback). */
  voice_enabled: "0",
  /** OpenAI TTS voice id. */
  voice_tts_voice: "onyx",
  /** Push-to-talk hotkey (empty → click only). */
  voice_hotkey: "",
  /** Auto-reopen the mic after Jarvis speaks ("1" on / "0" strict press-to-talk). */
  voice_conversation_mode: "0",
  /** Preset id used for voice-originated turns. */
  voice_jarvis_preset_id: "preset-jarvis",
  /** Spoken morning-briefing time (24h "HH:MM"; empty → on first daily interaction). */
  voice_morning_briefing_time: "",

  // ─── Remote reachability (Phase 9) ───────────────────────
  /** Telegram bot token (empty → bridge disabled). */
  telegram_bot_token: "",
  /** The only Telegram chat id the bot will answer (rejects all others). */
  telegram_chat_id: "",
  /** Cloudflare Tunnel expected/enabled (informational + gates the bridge UI). */
  remote_tunnel_enabled: "0",
};
