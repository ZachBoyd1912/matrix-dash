"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import type { Preset } from "@/types/jarvis";

export default function PresetsPage() {
  const ref = useGsapEntrance();
  const [list, setList] = useState<Preset[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/presets");
    setList(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    if (!name.trim()) return;
    await fetch("/api/presets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, systemPrompt }),
    });
    setName("");
    setSystemPrompt("");
    setOpen(false);
    toast.success("Persona saved");
    refresh();
  };

  const remove = async (p: Preset) => {
    const ok = await confirm({ title: `Delete "${p.name}"?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    await fetch(`/api/presets?id=${p.id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div ref={ref} className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Personas</h2>
        <p className="text-text-secondary text-sm mt-1">
          Pre-built system prompts you can swap into a chat (&ldquo;Jarvis butler&rdquo;, &ldquo;Senior reviewer&rdquo;, etc.).
        </p>
      </div>

      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus size={14} /> New persona
      </Button>

      {list.length === 0 ? (
        <EmptyState title="No personas yet" />
      ) : (
        <div className="space-y-2">
          {list.map((p) => (
            <Card key={p.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{p.name}</p>
                <p className="text-xs text-text-secondary mt-1 line-clamp-2 font-mono">{p.systemPrompt}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(p)} aria-label="Delete">
                <Trash2 size={13} className="text-rose-400" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New persona">
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Persona name" autoFocus />
          <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={6} placeholder="You are a..." />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={!name.trim()}>Create</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
