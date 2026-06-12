"use client";

import { Trash2, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import type { AiProviderPublic } from "@/types/ai-provider";

interface Props {
  providers: AiProviderPublic[];
  onChange: () => void;
}

export function ProviderList({ providers, onChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [model, setModel] = useState("");

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
    if (!confirm("Remove this provider?")) return;
    await fetch(`/api/providers/${id}`, { method: "DELETE" });
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
