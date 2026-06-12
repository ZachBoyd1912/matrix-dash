"use client";

import { useCallback, useEffect, useState } from "react";
import { ProviderForm } from "@/components/settings/provider-form";
import { ProviderList } from "@/components/settings/provider-list";
import { useAppStore } from "@/lib/stores/use-app-store";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import type { AiProviderPublic } from "@/types/ai-provider";

export default function ProvidersPage() {
  const ref = useGsapEntrance();
  const [providers, setProviders] = useState<AiProviderPublic[]>([]);
  const setStoreProviders = useAppStore((s) => s.setProviders);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/providers");
    const data = (await res.json()) as AiProviderPublic[];
    setProviders(data);
    setStoreProviders(data);
  }, [setStoreProviders]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div ref={ref} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">AI Providers</h2>
        <p className="text-text-secondary text-sm mt-1">
          Plug in any Anthropic, OpenAI, Google, or OpenAI-compatible endpoint.
        </p>
      </div>
      <ProviderList providers={providers} onChange={refresh} />
      <ProviderForm onCreated={refresh} />
    </div>
  );
}
