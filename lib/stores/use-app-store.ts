"use client";

import { create } from "zustand";
import type { AiProviderPublic } from "@/types/ai-provider";

interface AppState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  chatMode: "chat" | "agent";
  setChatMode: (mode: "chat" | "agent") => void;
  autoSpeak: boolean;
  setAutoSpeak: (on: boolean) => void;

  providers: AiProviderPublic[];
  activeProviderId: string | null;
  setProviders: (providers: AiProviderPublic[]) => void;
  setActiveProviderId: (id: string | null) => void;
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
  autoSpeak: false,
  setAutoSpeak: (autoSpeak) => set({ autoSpeak }),

  providers: [],
  activeProviderId: null,
  setProviders: (providers) => {
    const active = providers.find((p) => p.isActive);
    set({ providers, activeProviderId: active ? active.id : providers[0]?.id ?? null });
  },
  setActiveProviderId: (id) => set({ activeProviderId: id }),
}));
