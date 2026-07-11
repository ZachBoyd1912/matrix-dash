"use client";

import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { TourLauncher } from "@/components/tour/tour-launcher";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import { PwaRegister } from "./pwa-register";
import { ThemeStyle } from "./theme-style";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmHost } from "@/components/ui/confirm-host";
import { ConsoleCapture } from "@/components/console/console-capture";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-emerald-400 focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-black"
      >
        Skip to main content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 pb-14 outline-none md:pb-0">
          {children}
        </main>
      </div>
      <MobileNav />
      <CommandPalette />
      <TourLauncher />
      <Toaster />
      <ConfirmHost />
      <ConsoleCapture />
      <OnboardingWizard />
      <PwaRegister />
      <ThemeStyle />
    </div>
  );
}
