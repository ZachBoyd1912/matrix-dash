"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Wand2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import type { Skill } from "@/types/jarvis";

export default function SkillsPage() {
  const ref = useGsapEntrance();
  const [list, setList] = useState<Skill[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/skills");
    setList(await res.json());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    if (!name.trim()) return;
    await fetch("/api/skills", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description, instructions }),
    });
    toast.success("Skill created");
    setName("");
    setDescription("");
    setInstructions("");
    setOpen(false);
    refresh();
  };

  const toggle = async (s: Skill) => {
    await fetch(`/api/skills/${s.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isEnabled: !s.isEnabled }),
    });
    refresh();
  };

  const remove = async (s: Skill) => {
    const ok = await confirm({ title: `Delete "${s.name}"?`, confirmLabel: "Delete", danger: true });
    if (!ok) return;
    await fetch(`/api/skills/${s.id}`, { method: "DELETE" });
    toast.success("Skill deleted");
    refresh();
  };

  return (
    <div ref={ref} className="px-4 md:px-8 py-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Skills</h1>
          <p className="text-text-secondary text-sm mt-1">
            Reusable instruction packs the agent loads when you&apos;re in Agent mode.
          </p>
        </div>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Plus size={14} /> New skill
        </Button>
      </div>

      {list === null ? null : list.length === 0 ? (
        <EmptyState
          icon={<Wand2 size={16} />}
          title="No skills yet"
          description="Teach the agent a repeatable capability — e.g. 'Always format code reviews as a checklist'."
          action={<Button variant="primary" size="sm" onClick={() => setOpen(true)}><Plus size={13} /> New skill</Button>}
        />
      ) : (
        <div className="space-y-2">
          {list.map((s) => (
            <Card key={s.id} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{s.name}</p>
                {s.description && <p className="text-xs text-text-secondary mt-0.5">{s.description}</p>}
                <p className="text-[11px] text-text-muted mt-1 line-clamp-2 font-mono">{s.instructions}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={!!s.isEnabled} onCheckedChange={() => toggle(s)} label="Enabled" />
                <Button size="icon" variant="ghost" onClick={() => remove(s)} aria-label="Delete">
                  <Trash2 size={14} className="text-rose-400" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New skill" description="Give the agent a named capability.">
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Skill name" autoFocus />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" />
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={6}
            placeholder="Instructions the agent should follow when this skill applies…"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={create} disabled={!name.trim()}>Create</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
