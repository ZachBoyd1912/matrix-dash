"use client";

import { create } from "zustand";
import type { AiProviderPublic } from "@/types/ai-provider";
import type { ReasoningEffort } from "@/lib/ai/models";
import type { GenerationParams } from "@/types/settings";
import type { BeforeInstallPromptEvent } from "@/types/pwa";

interface AppState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  chatMode: "chat" | "agent";
  setChatMode: (mode: "chat" | "agent") => void;
  /** When true, the chat runs through the real Claude Code CLI engine. */
  useClaudeCode: boolean;
  setUseClaudeCode: (on: boolean) => void;
  /** Pulsed true by the /model slash command to open the model dropdown. */
  modelSelectorOpen: boolean;
  setModelSelectorOpen: (open: boolean) => void;
  autoSpeak: boolean;
  setAutoSpeak: (on: boolean) => void;

  providers: AiProviderPublic[];
  activeProviderId: string | null;
  setProviders: (providers: AiProviderPublic[]) => void;
  setActiveProviderId: (id: string | null) => void;

  /** Per-conversation model override; null = use the active provider's defaultModel. */
  modelOverride: string | null;
  setModelOverride: (model: string | null) => void;
  /** Per-conversation reasoning/thinking level. */
  reasoningEffort: ReasoningEffort;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  /** Per-conversation sampling overrides (temperature, topP, etc.) — in-memory
   *  only, same as reasoningEffort/modelOverride above, not written to session
   *  metadata; resets on reload. */
  generationParams: GenerationParams;
  setGenerationParams: (params: GenerationParams) => void;

  /** Captured `beforeinstallprompt` event — non-null only while the browser
   *  considers the app installable and hasn't been asked yet. */
  installPromptEvent: BeforeInstallPromptEvent | null;
  setInstallPromptEvent: (event: BeforeInstallPromptEvent | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  mobileNavOpen: false,
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  chatMode: "chat",
  setChatMode: (chatMode) => set({ chatMode }),
  useClaudeCode: false,
  setUseClaudeCode: (useClaudeCode) => set({ useClaudeCode }),
  modelSelectorOpen: false,
  setModelSelectorOpen: (modelSelectorOpen) => set({ modelSelectorOpen }),
  autoSpeak: false,
  setAutoSpeak: (autoSpeak) => set({ autoSpeak }),

  providers: [],
  activeProviderId: null,
  setProviders: (providers) => {
    const active = providers.find((p) => p.isActive);
    set({ providers, activeProviderId: active ? active.id : (providers[0]?.id ?? null) });
  },
  // Switching provider clears the model override — a model id is provider-specific.
  setActiveProviderId: (id) => set({ activeProviderId: id, modelOverride: null }),

  modelOverride: null,
  setModelOverride: (modelOverride) => set({ modelOverride }),
  reasoningEffort: "off",
  setReasoningEffort: (reasoningEffort) => set({ reasoningEffort }),
  generationParams: {},
  setGenerationParams: (generationParams) => set({ generationParams }),

  installPromptEvent: null,
  setInstallPromptEvent: (installPromptEvent) => set({ installPromptEvent }),
}));
