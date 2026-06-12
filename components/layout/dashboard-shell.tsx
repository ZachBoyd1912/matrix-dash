"use client";

import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
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
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
