"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/stores/use-feedback";
import type { AgentConfig, AgentMode, PushMode } from "@/types/agents";

export interface AgentDraft {
  name: string;
  description: string;
  instructions: string;
  model: string;
  cwd: string;
  writeAllowlist: string; // newline-separated in the form
  mode: AgentMode;
  pushMode: "" | PushMode;
  schedule: string;
  scheduleEnabled: boolean;
  isEnabled: boolean;
}

function draftFrom(agent: AgentConfig | null): AgentDraft {
  return {
    name: agent?.name ?? "",
    description: agent?.description ?? "",
    instructions: agent?.instructions ?? "",
    model: agent?.model ?? "",
    cwd: agent?.cwd ?? "",
    writeAllowlist: (agent?.writeAllowlist ?? []).join("\n"),
    mode: agent?.mode ?? "triggered",
    pushMode: agent?.pushMode ?? "",
    schedule: agent?.schedule ?? "",
    scheduleEnabled: agent?.scheduleEnabled ?? false,
    isEnabled: agent?.isEnabled ?? true,
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** null = create; an agent = edit. */
  editing: AgentConfig | null;
  onSaved: () => void;
}

export function AgentForm({ open, onClose, editing, onSaved }: Props) {
  const [draft, setDraft] = useState<AgentDraft>(() => draftFrom(editing));
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);

  // Reset the form whenever the target agent changes.
  const key = editing?.id ?? "new";
  if (seeded !== key) {
    setDraft(draftFrom(editing));
    setSeeded(key);
  }

  const set = <K extends keyof AgentDraft>(k: K, v: AgentDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  async function draftWithAI() {
    if (!aiPrompt.trim()) return;
    setDrafting(true);
    try {
      const res = await fetch("/api/agents/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: aiPrompt.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Draft failed");
      }
      const { draft: d } = (await res.json()) as {
        draft: {
          name?: string;
          description?: string;
          instructions?: string;
          mode?: AgentMode;
          schedule?: string | null;
          writeAllowlist?: string[];
        };
      };
      setDraft((cur) => ({
        ...cur,
        name: d.name ?? cur.name,
        description: d.description ?? cur.description,
        instructions: d.instructions ?? cur.instructions,
        mode: d.mode ?? cur.mode,
        schedule: d.schedule ?? "",
        writeAllowlist: (d.writeAllowlist ?? []).join("\n"),
        scheduleEnabled: !!d.schedule,
      }));
      toast.success("Draft ready — review and save");
    } catch (err) {
      toast.error("Could not draft", err instanceof Error ? err.message : undefined);
    } finally {
      setDrafting(false);
    }
  }

  async function save() {
    if (!draft.name.trim()) {
      toast.error("Name required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: draft.name.trim(),
        description: draft.description,
        instructions: draft.instructions,
        model: draft.model.trim() || null,
        cwd: draft.cwd.trim() || null,
        writeAllowlist: draft.writeAllowlist
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        mode: draft.mode,
        pushMode: draft.pushMode || null,
        schedule: draft.schedule.trim() || null,
        scheduleEnabled: draft.scheduleEnabled,
        isEnabled: draft.isEnabled,
      };
      const url = editing ? `/api/agents/${editing.id}` : "/api/agents";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof data.error === "string" ? data.error : "Save failed");
      }
      toast.success(editing ? "Agent updated" : "Agent created");
      onSaved();
      onClose();
    } catch (err) {
      toast.error("Could not save", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : "New agent"}
      description="Autonomous agents run on the Claude Agent SDK with gated writes and full audit."
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        {!editing && (
          <div className="border-border/60 grid gap-1.5 rounded-md border bg-white/[0.02] p-3">
            <Label>Describe it — draft with AI</Label>
            <div className="flex gap-2">
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="an agent that checks my inbox every morning and drafts replies"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void draftWithAI();
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={draftWithAI}
                disabled={drafting || !aiPrompt.trim()}
              >
                {drafting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label>Name</Label>
          <Input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Repo Custodian"
          />
        </div>

        <div className="grid gap-1.5">
          <Label>Description</Label>
          <Input
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Daily typecheck + test report"
          />
        </div>

        <div className="grid gap-1.5">
          <Label>Instructions (system prompt)</Label>
          <Textarea
            value={draft.instructions}
            onChange={(e) => set("instructions", e.target.value)}
            rows={5}
            placeholder="Describe exactly what this agent should do, and what counts as urgent."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label>Model (blank = Sonnet)</Label>
            <Input
              value={draft.model}
              onChange={(e) => set("model", e.target.value)}
              placeholder="claude-sonnet-4-5"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Working directory (blank = ~/MatrixDash)</Label>
            <Input
              value={draft.cwd}
              onChange={(e) => set("cwd", e.target.value)}
              placeholder="/Users/zach/Desktop/matrix-dash"
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label>Write allowlist (one path prefix per line — its safe zone)</Label>
          <Textarea
            value={draft.writeAllowlist}
            onChange={(e) => set("writeAllowlist", e.target.value)}
            rows={3}
            placeholder={"/Users/zach/MatrixDash/scratch\n/Users/zach/Desktop/matrix-dash"}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label>Mode</Label>
            <Select value={draft.mode} onChange={(e) => set("mode", e.target.value as AgentMode)}>
              <option value="triggered">Triggered</option>
              <option value="standing_watch">Standing watch</option>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Push mode (blank = auto-detect)</Label>
            <Select
              value={draft.pushMode}
              onChange={(e) => set("pushMode", e.target.value as "" | PushMode)}
            >
              <option value="">Auto-detect</option>
              <option value="direct">Direct to main</option>
              <option value="pr">Branch + PR</option>
            </Select>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label>Schedule (cron expression, optional)</Label>
          <Input
            value={draft.schedule}
            onChange={(e) => set("schedule", e.target.value)}
            placeholder="0 7 * * *"
          />
        </div>

        <div className="border-border/60 flex items-center justify-between rounded-md border px-3 py-2">
          <span className="text-sm">Schedule enabled</span>
          <Switch
            checked={draft.scheduleEnabled}
            onCheckedChange={(v) => set("scheduleEnabled", v)}
          />
        </div>

        <div className="border-border/60 flex items-center justify-between rounded-md border px-3 py-2">
          <span className="text-sm">Agent enabled</span>
          <Switch checked={draft.isEnabled} onCheckedChange={(v) => set("isEnabled", v)} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {editing ? "Save changes" : "Create agent"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
