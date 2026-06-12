export interface AppSettings {
  autoExtract: boolean;
  autoInject: boolean;
  maxInjectedMemories: number;
  systemPrompt: string;
}

export const SETTING_DEFAULTS: Record<string, string> = {
  autoExtract: "1",
  autoInject: "1",
  maxInjectedMemories: "10",
  systemPrompt: "",
};
