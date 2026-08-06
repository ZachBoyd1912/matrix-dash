"use client";

import { useEffect, useState } from "react";
import { ChevronDown, FileText, BrainCircuit, Bot, Search, Plus, Star, Pin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MEMORY_TYPE_META } from "@/types/memory";
import type { Note } from "@/types/note";
import type { Memory } from "@/types/memory";
import type { ClaudeCodeTree } from "@/types/vault";
import { cn } from "@/lib/utils/cn";

interface Props {
  notes: Note[] | null;
  memories: Memory[] | null;
  ccTree: ClaudeCodeTree | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  onNewNote: () => void;
  onNewMemory: () => void;
}

const SECTION_STORAGE_PREFIX = "matrix-vault-section-";

function useSectionExpanded(id: string, defaultOpen = true) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    const saved = localStorage.getItem(SECTION_STORAGE_PREFIX + id);
    if (saved !== null) setOpen(saved === "1");
  }, [id]);
  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      localStorage.setItem(SECTION_STORAGE_PREFIX + id, next ? "1" : "0");
      return next;
    });
  };
  return { open, toggle };
}

function SectionHeader({
  icon: Icon,
  label,
  count,
  open,
  onToggle,
  onAdd,
}: {
  icon: React.ElementType;
  label: string;
  count: number | null;
  open: boolean;
  onToggle: () => void;
  onAdd?: () => void;
}) {
  return (
    <div className="group flex items-center gap-1 px-1">
      <button
        onClick={onToggle}
        className="text-text-secondary hover:text-text-primary flex flex-1 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-xs font-medium transition-colors hover:bg-white/[0.03]"
      >
        <ChevronDown
          size={12}
          className={cn("shrink-0 transition-transform", !open && "-rotate-90")}
        />
        <Icon size={13} className="shrink-0" />
        <span className="flex-1 truncate">{label}</span>
        {count !== null && (
          <span className="text-text-muted text-[10px] tabular-nums">{count}</span>
        )}
      </button>
      {onAdd && (
        <button
          onClick={onAdd}
          aria-label={`New ${label}`}
          className="text-text-muted hover:text-text-primary rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Plus size={12} />
        </button>
      )}
    </div>
  );
}

function Row({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "block w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        active
          ? "bg-white/[0.06] text-emerald-400 ring-1 ring-emerald-400/20"
          : "text-text-secondary hover:text-text-primary hover:bg-white/[0.03]"
      )}
    >
      {children}
    </button>
  );
}

export function VaultSidebar({
  notes,
  memories,
  ccTree,
  selectedId,
  onSelect,
  query,
  onQueryChange,
  onNewNote,
  onNewMemory,
}: Props) {
  const notesSection = useSectionExpanded("notes");
  const memoriesSection = useSectionExpanded("memories");
  const ccSection = useSectionExpanded("claude-code", false);
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set());

  const toggleProject = (name: string) => {
    setOpenProjects((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const lowerQuery = query.trim().toLowerCase();
  const filteredCcProjects = (ccTree?.projects ?? [])
    .map((p) => ({
      ...p,
      files: lowerQuery
        ? p.files.filter((f) => f.name.toLowerCase().includes(lowerQuery))
        : p.files,
    }))
    .filter((p) => !lowerQuery || p.files.length > 0 || p.name.toLowerCase().includes(lowerQuery));

  return (
    <aside className="flex h-full flex-col border-r border-white/5 bg-white/[0.01]">
      <div className="border-b border-white/5 p-3">
        <div className="relative">
          <Search size={13} className="text-text-muted absolute top-1/2 left-3 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search the vault…"
            aria-label="Search the vault"
            className="h-9 pl-9 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
        {/* Matrix Notes */}
        <div>
          <SectionHeader
            icon={FileText}
            label="Matrix Notes"
            count={notes?.length ?? null}
            open={notesSection.open}
            onToggle={notesSection.toggle}
            onAdd={onNewNote}
          />
          {notesSection.open && (
            <div className="mt-1 space-y-0.5 pl-1">
              {notes === null ? (
                <Skeleton className="h-8" />
              ) : notes.length === 0 ? (
                <p className="text-text-muted px-2 py-1 text-[11px]">No notes yet.</p>
              ) : (
                notes.map((n) => (
                  <Row
                    key={n.id}
                    active={selectedId === `note:${n.id}`}
                    onClick={() => onSelect(`note:${n.id}`)}
                  >
                    <span className="flex items-center gap-1.5">
                      {n.isFavorite && (
                        <Star size={10} className="shrink-0 fill-amber-400 text-amber-400" />
                      )}
                      <span className="truncate">{n.title || "Untitled"}</span>
                    </span>
                  </Row>
                ))
              )}
            </div>
          )}
        </div>

        {/* Memory Bank */}
        <div>
          <SectionHeader
            icon={BrainCircuit}
            label="Memory Bank"
            count={memories?.length ?? null}
            open={memoriesSection.open}
            onToggle={memoriesSection.toggle}
            onAdd={onNewMemory}
          />
          {memoriesSection.open && (
            <div className="mt-1 space-y-0.5 pl-1">
              {memories === null ? (
                <Skeleton className="h-8" />
              ) : memories.length === 0 ? (
                <p className="text-text-muted px-2 py-1 text-[11px]">No memories yet.</p>
              ) : (
                memories.map((m) => {
                  const meta = MEMORY_TYPE_META[m.type];
                  return (
                    <Row
                      key={m.id}
                      active={selectedId === `memory:${m.id}`}
                      onClick={() => onSelect(`memory:${m.id}`)}
                    >
                      <span className="flex items-center gap-1.5">
                        {m.isPinned && (
                          <Pin size={10} className="shrink-0 fill-amber-400 text-amber-400" />
                        )}
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            meta.bg.replace("/10", "")
                          )}
                        />
                        <span className="truncate">{m.content.slice(0, 60)}</span>
                      </span>
                    </Row>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Claude Code */}
        <div>
          <SectionHeader
            icon={Bot}
            label="Claude Code"
            count={ccTree ? filteredCcProjects.reduce((n, p) => n + p.files.length, 0) : null}
            open={ccSection.open}
            onToggle={ccSection.toggle}
          />
          {ccSection.open && (
            <div className="mt-1 space-y-1 pl-1">
              {ccTree === null ? (
                <Skeleton className="h-8" />
              ) : ccTree.unreachable ? (
                <p className="text-text-muted px-2 py-1 text-[11px]">
                  Vault unreachable — configure it in Settings → Integrations → Obsidian.
                </p>
              ) : filteredCcProjects.length === 0 ? (
                <p className="text-text-muted px-2 py-1 text-[11px]">No memory files found.</p>
              ) : (
                filteredCcProjects.map((p) => {
                  const projectOpen = openProjects.has(p.name) || !!lowerQuery;
                  return (
                    <div key={p.name}>
                      <button
                        onClick={() => toggleProject(p.name)}
                        className="text-text-muted hover:text-text-secondary flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[11px] font-medium"
                      >
                        <ChevronDown
                          size={10}
                          className={cn(
                            "shrink-0 transition-transform",
                            !projectOpen && "-rotate-90"
                          )}
                        />
                        <span className="truncate">{p.name}</span>
                        <span className="text-text-muted ml-auto text-[10px] tabular-nums">
                          {p.files.length}
                        </span>
                      </button>
                      {projectOpen && (
                        <div className="space-y-0.5 pl-4">
                          {p.files.map((f) => (
                            <Row
                              key={f.relPath}
                              active={selectedId === `cc:${p.name}/${f.relPath}`}
                              onClick={() => onSelect(`cc:${p.name}/${f.relPath}`)}
                            >
                              {f.name}
                            </Row>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
