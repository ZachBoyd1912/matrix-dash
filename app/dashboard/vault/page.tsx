"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Network, List as ListIcon, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { Select } from "@/components/ui/select";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { ClaudeCodeViewer } from "@/components/vault/claude-code-viewer";
import { VaultGraph } from "@/components/vault/vault-graph-lazy";
import { NoteEditor } from "@/components/notes/note-editor";
import { MemoryDetail } from "@/components/memory-bank/memory-detail";
import { NewMemoryDialog } from "@/components/memory-bank/new-memory-dialog";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import type { Note, NoteBacklinks } from "@/types/note";
import type { LinkedMemory, Memory } from "@/types/memory";
import type { ClaudeCodeFileContent, ClaudeCodeTree, VaultGraphData } from "@/types/vault";

type Detail =
  | { source: "note"; note: Note; backlinks: NoteBacklinks }
  | { source: "memory"; memory: Memory; links: LinkedMemory[] }
  | { source: "claude-code"; file: ClaudeCodeFileContent };

/** Parses the `cc:<project>/<relPath>` node-id shape used throughout this page. */
function parseCcId(id: string): { project: string; file: string } | null {
  const rest = id.slice("cc:".length);
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  return { project: rest.slice(0, slash), file: rest.slice(slash + 1) };
}

export default function VaultPage() {
  const ref = useGsapEntrance();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [ccTree, setCcTree] = useState<ClaudeCodeTree | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [view, setView] = useState<"list" | "graph">("list");
  const [graph, setGraph] = useState<VaultGraphData | null>(null);
  const [ccGraphProject, setCcGraphProject] = useState<string>("");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [newMemoryOpen, setNewMemoryOpen] = useState(false);

  // Honor ?vault=notes|memory-bank + ?focus=<rawId> + ?new=1 (redirect stubs
  // from the old /dashboard/notes and /dashboard/memory-bank routes, and any
  // other deep link e.g. the command palette).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vault = params.get("vault");
    const focus = params.get("focus");
    if (focus && vault === "notes") setSelectedId(`note:${focus}`);
    else if (focus && vault === "memory-bank") setSelectedId(`memory:${focus}`);
    if (params.get("new") === "1") {
      if (vault === "memory-bank") setNewMemoryOpen(true);
      else void createNote();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshNotes = useCallback(async () => {
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    const res = await fetch(`/api/notes?${params}`);
    setNotes(await res.json());
  }, [debouncedQuery]);

  const refreshMemories = useCallback(async () => {
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    const res = await fetch(`/api/memories?${params}`);
    setMemories(await res.json());
  }, [debouncedQuery]);

  useEffect(() => {
    void refreshNotes();
  }, [refreshNotes]);
  useEffect(() => {
    void refreshMemories();
  }, [refreshMemories]);

  useEffect(() => {
    fetch("/api/vault/claude-code")
      .then((r) => r.json())
      .then(setCcTree)
      .catch(() => setCcTree({ projects: [], unreachable: true }));
  }, []);

  useEffect(() => {
    if (view !== "graph") return;
    const params = new URLSearchParams();
    if (ccGraphProject) params.set("ccProject", ccGraphProject);
    fetch(`/api/vault/graph?${params}`)
      .then((r) => r.json())
      .then(setGraph)
      .catch(() => setGraph(null));
  }, [view, ccGraphProject, notes, memories]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    if (selectedId.startsWith("note:")) {
      const id = selectedId.slice("note:".length);
      fetch(`/api/notes/${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setDetail(data ? { source: "note", ...data } : null))
        .catch(() => setDetail(null));
    } else if (selectedId.startsWith("memory:")) {
      const id = selectedId.slice("memory:".length);
      fetch(`/api/memories/${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setDetail(data ? { source: "memory", ...data } : null))
        .catch(() => setDetail(null));
    } else if (selectedId.startsWith("cc:")) {
      const parsed = parseCcId(selectedId);
      if (!parsed) {
        setDetail(null);
        return;
      }
      fetch(
        `/api/vault/claude-code/file?project=${encodeURIComponent(parsed.project)}&file=${encodeURIComponent(parsed.file)}`
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setDetail(data ? { source: "claude-code", file: data } : null))
        .catch(() => setDetail(null));
    }
  }, [selectedId]);

  const createNote = async (title?: string) => {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title ?? "Untitled note", content: "" }),
    });
    const data = await res.json();
    setSelectedId(`note:${data.id}`);
    await refreshNotes();
  };

  const navigateNoteTitle = async (title: string) => {
    const match = (notes ?? []).find((n) => n.title === title);
    if (match) {
      setSelectedId(`note:${match.id}`);
      return;
    }
    await createNote(title);
  };

  // [[slug]] inside a Claude Code file resolves to another file in the SAME
  // project — the confirmed on-disk convention (basename sans .md).
  const navigateCcTitle = (title: string) => {
    if (!detail || detail.source !== "claude-code") return;
    const project = ccTree?.projects.find((p) => p.name === detail.file.project);
    const match = project?.files.find((f) => f.name.toLowerCase() === title.toLowerCase());
    if (match) setSelectedId(`cc:${match.project}/${match.relPath}`);
  };

  const refreshAfterMemoryChange = () => {
    void refreshMemories();
  };

  const ccProjectOptions = useMemo(() => ccTree?.projects.map((p) => p.name) ?? [], [ccTree]);

  return (
    <div ref={ref} className="page-h grid grid-cols-1 md:grid-cols-[320px_1fr]">
      <VaultSidebar
        notes={notes}
        memories={memories}
        ccTree={ccTree}
        selectedId={selectedId}
        onSelect={setSelectedId}
        query={query}
        onQueryChange={setQuery}
        onNewNote={() => void createNote()}
        onNewMemory={() => setNewMemoryOpen(true)}
      />

      <section className="flex min-w-0 flex-col">
        <div className="flex items-center justify-end gap-2 border-b border-white/5 px-4 py-2">
          {view === "graph" && ccProjectOptions.length > 0 && (
            <Select
              value={ccGraphProject}
              onChange={(e) => setCcGraphProject(e.target.value)}
              className="h-8 text-xs"
            >
              <option value="">Claude Code: none loaded</option>
              {ccProjectOptions.map((p) => (
                <option key={p} value={p}>
                  Claude Code: {p}
                </option>
              ))}
            </Select>
          )}
          <div className="glass-input flex items-center gap-1 rounded-md p-0.5">
            <button
              onClick={() => setView("list")}
              className={`h-7 rounded-[5px] px-2 transition-colors ${view === "list" ? "text-text-primary bg-white/10" : "text-text-muted hover:text-text-secondary"}`}
              aria-label="List view"
            >
              <ListIcon size={13} />
            </button>
            <button
              onClick={() => setView("graph")}
              className={`h-7 rounded-[5px] px-2 transition-colors ${view === "graph" ? "text-text-primary bg-white/10" : "text-text-muted hover:text-text-secondary"}`}
              aria-label="Graph view"
            >
              <Network size={13} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {view === "graph" ? (
            <div className="h-full p-4">
              <div className="glass h-full overflow-hidden rounded-xl">
                {graph && graph.nodes.length > 0 ? (
                  <VaultGraph
                    data={graph}
                    onSelect={(id) => {
                      setSelectedId(id);
                      setView("list");
                    }}
                  />
                ) : (
                  <div className="grid h-full place-items-center">
                    <EmptyState
                      icon={<Network size={16} />}
                      title="No graph yet"
                      description="Add notes/memories and connect them with [[wiki links]], or pick a Claude Code project above."
                    />
                  </div>
                )}
              </div>
            </div>
          ) : detail?.source === "note" ? (
            <NoteEditor
              key={detail.note.id}
              note={detail.note}
              backlinks={detail.backlinks}
              onChange={refreshNotes}
              onNavigateTitle={navigateNoteTitle}
              onNavigateId={(id) => setSelectedId(`note:${id}`)}
            />
          ) : detail?.source === "memory" ? (
            <div className="mx-auto max-w-2xl p-4 md:p-6">
              <MemoryDetail
                memory={detail.memory}
                links={detail.links}
                onChange={refreshAfterMemoryChange}
                onSelectLinked={(id) => setSelectedId(`memory:${id}`)}
              />
            </div>
          ) : detail?.source === "claude-code" ? (
            <ClaudeCodeViewer file={detail.file} onNavigateTitle={navigateCcTitle} />
          ) : (
            <div className="grid h-full place-items-center p-8">
              <EmptyState
                icon={<FileText size={16} />}
                title="Nothing selected"
                description="Pick a note, memory, or Claude Code file from the sidebar."
                action={
                  <Button variant="primary" size="sm" onClick={() => void createNote()}>
                    <Plus size={13} /> New note
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </section>

      <NewMemoryDialog
        open={newMemoryOpen}
        onClose={() => setNewMemoryOpen(false)}
        onCreated={refreshAfterMemoryChange}
      />
    </div>
  );
}
