"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Wand2, Trash2, Github, Loader2, Search, CheckCheck, CircleSlash } from "lucide-react";
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
  const RENDER_CAP = 300;

  const refresh = useCallback(async () => {
    const res = await fetch("/api/skills");
    setList(await res.json());
  }, []);

  const enabledCount = useMemo(
    () => (list ?? []).filter((s) => s.isEnabled).length,
    [list],
  );

  const filtered = useMemo(() => {
    if (!list) return [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q),
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
          `${found} found · ${skipped} skipped (duplicates). Imported skills start disabled.`,
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
          action={<Button variant="primary" size="sm" onClick={() => setOpen(true)}><Plus size={13} /> New skill</Button>}
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${list.length} skills…`}
                className="pl-8"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted tabular-nums">
                {enabledCount} / {list.length} enabled
              </span>
              <Button variant="ghost" size="sm" onClick={() => bulkSet(true)} disabled={bulkBusy}>
                <CheckCheck size={13} /> Enable all
              </Button>
              <Button variant="ghost" size="sm" onClick={() => bulkSet(false)} disabled={bulkBusy}>
                <CircleSlash size={13} /> Disable all
              </Button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-text-muted py-6 text-center">No skills match “{query}”.</p>
          ) : (
            <div className="space-y-2">
              {shown.map((s) => (
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
              {filtered.length > shown.length && (
                <p className="text-xs text-text-muted py-3 text-center">
                  Showing {shown.length} of {filtered.length} — refine your search to narrow the list.
                </p>
              )}
            </div>
          )}
        </>
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

      <Dialog
        open={importOpen}
        onClose={() => !importing && setImportOpen(false)}
        title="Import skills from GitHub"
        description="Scans a public repo for SKILL.md files and imports each as a skill."
      >
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase text-text-muted block mb-1">Repository URL</label>
            <Input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="font-mono text-xs"
              autoFocus
              disabled={importing}
            />
          </div>
          <p className="text-[11px] text-text-muted">
            Every <span className="font-mono">SKILL.md</span> in the repo becomes a skill (name +
            description parsed from frontmatter or the first heading). Duplicates are skipped and
            imported skills start <span className="text-text-secondary">disabled</span>.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setImportOpen(false)} disabled={importing}>
              Cancel
            </Button>
            <Button variant="primary" onClick={importFromGithub} disabled={!repoUrl.trim() || importing}>
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Github size={14} />}
              {importing ? "Importing…" : "Import"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
