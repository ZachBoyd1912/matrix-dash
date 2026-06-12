"use client";

import { Trash2, Check, FlaskConical } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast, confirm } from "@/lib/stores/use-feedback";
import type { AiProviderPublic } from "@/types/ai-provider";

interface Props {
  providers: AiProviderPublic[];
  onChange: () => void;
}

export function ProviderList({ providers, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

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

  const updateModel = async (id: string) => {
    await fetch(`/api/providers/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultModel: model }),
    });
    setEditingId(null);
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
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  onBlur={() => updateModel(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") updateModel(p.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-6 text-[11px] w-48"
                  autoFocus
                />
              ) : (
                <button
                  onClick={() => {
                    setEditingId(p.id);
                    setModel(p.defaultModel ?? "");
                  }}
                  className="hover:text-text-secondary"
                >
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
