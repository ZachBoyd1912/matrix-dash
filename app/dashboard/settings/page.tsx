"use client";

import { useCallback, useEffect, useState } from "react";
import { Plug } from "lucide-react";
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
    <div ref={ref} className="space-y-8">
      <div className="relative overflow-hidden py-10">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div
          className="orb -top-8 right-16 h-44 w-44 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
        />
        <div className="relative">
          <span className="eyebrow">
            <Plug size={11} /> AI Providers
          </span>
          <h1 className="display text-gradient text-4xl md:text-5xl mt-3">
            AI Providers
          </h1>
          <p className="text-text-secondary text-sm mt-3 max-w-xl">
            Plug in any Anthropic, OpenAI, Google, or OpenAI-compatible endpoint.
          </p>
        </div>
      </div>
      <ProviderList providers={providers} onChange={refresh} />
      <ProviderForm onCreated={refresh} />
    </div>
  );
}
