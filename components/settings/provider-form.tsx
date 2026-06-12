"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import {
  DEFAULT_MODELS,
  PROVIDER_KINDS,
  type ProviderKind,
} from "@/types/ai-provider";

interface Props {
  onCreated: () => void;
}

export function ProviderForm({ onCreated }: Props) {
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<ProviderKind>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim() || !apiKey.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          provider,
          apiKey,
          baseUrl: provider === "custom" ? baseUrl : null,
          defaultModel: defaultModel || DEFAULT_MODELS[provider],
        }),
      });
      setName("");
      setApiKey("");
      setBaseUrl("");
      setDefaultModel("");
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase text-text-muted block mb-1">Label</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Anthropic key" />
          </div>
          <div>
            <label className="text-[10px] uppercase text-text-muted block mb-1">Provider</label>
            <Select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderKind)}
              className="w-full"
            >
              {PROVIDER_KINDS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase text-text-muted block mb-1">API key</label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase text-text-muted block mb-1">
              Default model
            </label>
            <Input
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              placeholder={DEFAULT_MODELS[provider]}
            />
          </div>
        </div>
        {provider === "custom" && (
          <div>
            <label className="text-[10px] uppercase text-text-muted block mb-1">Base URL</label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://openrouter.ai/api/v1"
            />
          </div>
        )}
        <div className="flex justify-end">
          <Button
            variant="primary"
            onClick={submit}
            disabled={!name.trim() || !apiKey.trim() || submitting}
          >
            <Plus size={14} /> {submitting ? "Adding…" : "Add provider"}
          </Button>
        </div>
        <p className="text-[10px] text-text-muted">
          API keys are encrypted with AES-256-GCM. The key lives in ~/MatrixDash/.key (mode 0600).
        </p>
      </div>
    </Card>
  );
}
