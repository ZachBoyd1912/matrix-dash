export interface AppSettings {
  autoExtract: boolean;
  autoInject: boolean;
  maxInjectedMemories: number;
  systemPrompt: string;
  /** Stream extended-thinking/reasoning from providers that support it (Anthropic). */
  enableThinking: boolean;
}

export const SETTING_DEFAULTS: Record<string, string> = {
  autoExtract: "1",
  autoInject: "1",
  maxInjectedMemories: "10",
  systemPrompt: "",
  enableThinking: "1",
  /** Local code-server (web VS Code) bind port. */
  ideServerPort: "3010",
  /** Auto-start code-server when the IDE page mounts ("1" on / "0" off). */
  ideServerAutoStart: "0",
};
