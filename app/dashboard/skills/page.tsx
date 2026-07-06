"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Wand2,
  Trash2,
  Github,
  Loader2,
  Search,
  CheckCheck,
  CircleSlash,
  ListChecks,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty";
import { toast, confirm } from "@/lib/stores/use-feedback";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import type { Skill } from "@/types/jarvis";

const DEFAULT_IMPORT_REPO = "https://github.com/sickn33/antigravity-awesome-skills";

export default function SkillsPage() {
  const ref = useGsapEntrance();
  const [list, setList] = useState<Skill[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");

  // GitHub bulk-import dialog state.
  const [importOpen, setImportOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState(DEFAULT_IMPORT_REPO);
  const [importing, setImporting] = useState(false);

  // Search + bulk actions (a catalog import can add 1000+ skills).
  const [query, setQuery] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const RENDER_CAP = 300;

  const refresh = useCallback(async () => {
    const res = await fetch("/api/skills");
    setList(await res.json());
  }, []);

  const enabledCount = useMemo(() => (list ?? []).filter((s) => s.isEnabled).length, [list]);

  const filtered = useMemo(() => {
    if (!list) return [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q)
    );
  }, [list, query]);

  const shown = filtered.slice(0, RENDER_CAP);

  const bulkSet = async (isEnabled: boolean) => {
    if (!list || list.length === 0 || bulkBusy) return;
    if (isEnabled) {
      const ok = await confirm({
        title: `Enable all ${list.length} skills?`,
        description:
          "Every enabled skill's instructions are injected into the agent's prompt. Enabling a large catalog can hit the context budget — extras are then omitted automatically.",
        confirmLabel: "Enable all",
      });
      if (!ok) return;
    }
    setBulkBusy(true);
    try {
      await fetch("/api/skills", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isEnabled }),
      });
      toast.success(isEnabled ? "All skills enabled" : "All skills disabled");
      await refresh();
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    const n = selected.size;
    const ok = await confirm({
      title: `Delete ${n} selected skill${n === 1 ? "" : "s"}?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await fetch("/api/skills", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    });
    toast.success(`Deleted ${n} skill${n === 1 ? "" : "s"}`);
    exitSelectMode();
    refresh();
  };

  const deleteAll = async () => {
    if (!list || list.length === 0) return;
    const ok = await confirm({
      title: `Delete all ${list.length} skills?`,
      description:
        "This permanently removes every skill, including any you created by hand. This can't be undone.",
      confirmLabel: "Delete all",
      danger: true,
      requireText: "DELETE",
    });
    if (!ok) return;
    await fetch("/api/skills", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    toast.success("All skills deleted");
    exitSelectMode();
    refresh();
  };

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

  const importFromGithub = async () => {
    if (!repoUrl.trim() || importing) return;
    setImporting(true);
    try {
      const res = await fetch("/api/skills/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repoUrl: repoUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error("Import failed", data?.error ?? `HTTP ${res.status}`);
        return;
      }
      const { imported = 0, skipped = 0, found = 0 } = data;
      if (imported === 0 && skipped === 0) {
        toast.info("Nothing imported", data?.error ?? "No SKILL.md files found.");
      } else {
        toast.success(
          `Imported ${imported} skill${imported === 1 ? "" : "s"}`,
          `${found} found · ${skipped} skipped (duplicates). Imported skills start disabled.`
        );
      }
      if (data?.truncated) {
        toast.info("Large repo", "Only the first batch of skills was imported.");
      }
      setImportOpen(false);
      refresh();
    } catch (err) {
      toast.error("Import failed", err instanceof Error ? err.message : "Network error");
    } finally {
      setImporting(false);
    }
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
    const ok = await confirm({
      title: `Delete "${s.name}"?`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/skills/${s.id}`, { method: "DELETE" });
    toast.success("Skill deleted");
    refresh();
  };

  return (
    <div ref={ref} className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Skills</h1>
          <p className="text-text-secondary mt-1 text-sm">
            Reusable instruction packs the agent loads when you&apos;re in Agent mode.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setImportOpen(true)}>
            <Github size={14} /> Import from GitHub
          </Button>
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus size={14} /> New skill
          </Button>
        </div>
      </div>

      {list === null ? null : list.length === 0 ? (
        <EmptyState
          icon={<Wand2 size={16} />}
          title="No skills yet"
          description="Teach the agent a repeatable capability — e.g. 'Always format code reviews as a checklist'."
          action={
            <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
              <Plus size={13} /> New skill
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search
                size={14}
                className="text-text-muted absolute top-1/2 left-2.5 -translate-y-1/2"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${list.length} skills…`}
                className="pl-8"
              />
            </div>
            {selectMode ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-text-muted text-xs tabular-nums">
                  {selected.size} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(new Set(shown.map((s) => s.id)))}
                >
                  <CheckCheck size={13} /> Select shown
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={deleteSelected}
                  disabled={selected.size === 0}
                  className="text-rose-400"
                >
                  <Trash2 size={13} /> Delete selected
                </Button>
                <Button variant="ghost" size="sm" onClick={exitSelectMode}>
                  Done
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-text-muted text-xs tabular-nums">
                  {enabledCount} / {list.length} enabled
                </span>
                <Button variant="ghost" size="sm" onClick={() => bulkSet(true)} disabled={bulkBusy}>
                  <CheckCheck size={13} /> Enable all
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => bulkSet(false)}
                  disabled={bulkBusy}
                >
                  <CircleSlash size={13} /> Disable all
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)}>
                  <ListChecks size={13} /> Select
                </Button>
                <Button variant="ghost" size="sm" onClick={deleteAll} className="text-rose-400">
                  <Trash2 size={13} /> Delete all
                </Button>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="text-text-muted py-6 text-center text-sm">No skills match “{query}”.</p>
          ) : (
            <div className="space-y-2">
              {shown.map((s) => (
                <Card
                  key={s.id}
                  className={`flex items-start justify-between gap-4 ${
                    selectMode && selected.has(s.id) ? "ring-1 ring-emerald-500/60" : ""
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        aria-label={`Select ${s.name}`}
                        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-emerald-500"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-text-primary text-sm font-medium">{s.name}</p>
                      {s.description && (
                        <p className="text-text-secondary mt-0.5 text-xs">{s.description}</p>
                      )}
                      <p className="text-text-muted mt-1 line-clamp-2 font-mono text-[11px]">
                        {s.instructions}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      checked={!!s.isEnabled}
                      onCheckedChange={() => toggle(s)}
                      label="Enabled"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove(s)}
                      aria-label="Delete"
                    >
                      <Trash2 size={14} className="text-rose-400" />
                    </Button>
                  </div>
                </Card>
              ))}
              {filtered.length > shown.length && (
                <p className="text-text-muted py-3 text-center text-xs">
                  Showing {shown.length} of {filtered.length} — refine your search to narrow the
                  list.
                </p>
              )}
            </div>
          )}
        </>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New skill"
        description="Give the agent a named capability."
      >
        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Skill name"
            autoFocus
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description"
          />
          <Textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={6}
            placeholder="Instructions the agent should follow when this skill applies…"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={create} disabled={!name.trim()}>
              Create
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={importOpen}
        onClose={() => !importing && setImportOpen(false)}
        title="Import skills from GitHub"
        description="Scans a public repo for SKILL.md files and imports each as a skill."
      >
        <div className="space-y-3">
          <div>
            <label className="text-text-muted mb-1 block text-[10px] uppercase">
              Repository URL
            </label>
            <Input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="font-mono text-xs"
              autoFocus
              disabled={importing}
            />
          </div>
          <p className="text-text-muted text-[11px]">
            Every <span className="font-mono">SKILL.md</span> in the repo becomes a skill (name +
            description parsed from frontmatter or the first heading). Duplicates are skipped and
            imported skills start <span className="text-text-secondary">disabled</span>.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setImportOpen(false)} disabled={importing}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={importFromGithub}
              disabled={!repoUrl.trim() || importing}
            >
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Github size={14} />}
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
