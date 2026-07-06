"use client";

import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import { PwaRegister } from "./pwa-register";
import { ThemeStyle } from "./theme-style";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmHost } from "@/components/ui/confirm-host";
import { ConsoleCapture } from "@/components/console/console-capture";
import { useAppStore } from "@/lib/stores/use-app-store";
import type { AiProviderPublic } from "@/types/ai-provider";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const setProviders = useAppStore((s) => s.setProviders);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((data: AiProviderPublic[]) => {
        if (Array.isArray(data)) setProviders(data);
      })
      .catch(() => {
        /* fine — sidebar will show "+ Add provider" */
      });
  }, [setProviders]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 pb-14 md:pb-0">{children}</main>
      </div>
      <MobileNav />
      <CommandPalette />
      <Toaster />
      <ConfirmHost />
      <ConsoleCapture />
      <PwaRegister />
      <ThemeStyle />
    </div>
  );
}
