"use client";

import { Trash2, Check, FlaskConical } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useState } from "react";
import { toast, confirm } from "@/lib/stores/use-feedback";
import type { ModelInfo } from "@/lib/ai/models";
import type { AiProviderPublic } from "@/types/ai-provider";

interface Props {
  providers: AiProviderPublic[];
  onChange: () => void;
}

export function ProviderList({ providers, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Begin editing a provider's default model: open the field and fetch its live
  // model catalogue (falls back to free-text if the listing fails or is empty).
  const startEdit = async (p: AiProviderPublic) => {
    setEditingId(p.id);
    setModel(p.defaultModel ?? "");
    setModels([]);
    setLoadingModels(true);
    try {
      const res = await fetch(`/api/providers/${p.id}/models`);
      const data = (await res.json()) as { models: ModelInfo[]; error?: string };
      setModels(data.models ?? []);
    } catch {
      /* keep free-text fallback */
    } finally {
      setLoadingModels(false);
    }
  };

  const test = async (p: AiProviderPublic) => {
    setTestingId(p.id);
    try {
      const res = await fetch(`/api/providers/${p.id}/test`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        toast.success(`${p.name} works`, `Model replied: ${data.message || "OK"}`);
      } else {
        toast.error(`${p.name} failed`, data.error);
      }
    } catch {
      toast.error(`${p.name} failed`, "Could not reach the test endpoint.");
    } finally {
      setTestingId(null);
    }
  };

  if (providers.length === 0) return null;

  const setActive = async (id: string) => {
    await fetch(`/api/providers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    onChange();
  };

  const updateModel = async (id: string, value: string) => {
    await fetch(`/api/providers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultModel: value }),
    });
    setEditingId(null);
    setModels([]);
    onChange();
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: "Remove provider?",
      description: "Chats using this provider will need a different one.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/providers/${id}`, { method: "DELETE" });
    toast.success("Provider removed");
    onChange();
  };

  return (
    <div className="space-y-2">
      {providers.map((p) => (
        <Card key={p.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-text-primary truncate">{p.name}</span>
              {p.isActive && <Badge className="bg-emerald-400/10 border-emerald-400/20 text-emerald-400">Active</Badge>}
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-text-muted">
              <span className="capitalize">{p.provider}</span>
              <span>·</span>
              {editingId === p.id ? (
                loadingModels ? (
                  <span className="text-[11px] text-text-muted">Loading models…</span>
                ) : models.length > 0 ? (
                  <Select
                    value={model}
                    onChange={(e) => updateModel(p.id, e.target.value)}
                    onBlur={() => setEditingId(null)}
                    className="h-6 text-[11px] w-56 py-0"
                    autoFocus
                  >
                    {/* Keep the current value selectable even if the API omits it. */}
                    {model && !models.some((m) => m.id === model) && <option value={model}>{model}</option>}
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label || m.id}
                        {m.reasoning ? " · reasoning" : ""}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    onBlur={() => updateModel(p.id, model)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updateModel(p.id, model);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-6 text-[11px] w-48"
                    autoFocus
                  />
                )
              ) : (
                <button onClick={() => startEdit(p)} className="hover:text-text-secondary">
                  {p.defaultModel || "no model"}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => test(p)}
              disabled={testingId === p.id}
            >
              <FlaskConical size={12} /> {testingId === p.id ? "Testing…" : "Test"}
            </Button>
            {!p.isActive && (
              <Button size="sm" variant="ghost" onClick={() => setActive(p.id)}>
                <Check size={12} /> Activate
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={() => remove(p.id)} aria-label="Remove">
              <Trash2 size={14} className="text-rose-400" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
