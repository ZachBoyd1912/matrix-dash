"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Network, List as ListIcon, FileText, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { VaultSidebar } from "@/components/vault/vault-sidebar";
import { VaultFileViewer } from "@/components/vault/vault-file-viewer";
import { VaultGraph } from "@/components/vault/vault-graph-lazy";
import { NoteEditor } from "@/components/notes/note-editor";
import { MemoryDetail } from "@/components/memory-bank/memory-detail";
import { NewMemoryDialog } from "@/components/memory-bank/new-memory-dialog";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import type { Note, NoteBacklinks } from "@/types/note";
import type { LinkedMemory, Memory } from "@/types/memory";
import type {
  VaultFileDetail,
  VaultGraphData,
  VaultIndexResponse,
  VaultSearchHit,
  VaultTreeFile,
  VaultTreeFolder,
} from "@/types/vault";

type Detail =
  | { source: "note"; note: Note; backlinks: NoteBacklinks }
  | { source: "memory"; memory: Memory; links: LinkedMemory[] }
  | { source: "file"; file: VaultFileDetail };

/** How often the index refreshes while the page sits open. */
const REFRESH_INTERVAL_MS = 10 * 60_000;

function walkFiles(folders: VaultTreeFolder[], out: VaultTreeFile[]): VaultTreeFile[] {
  for (const folder of folders) {
    out.push(...folder.files);
    walkFiles(folder.folders, out);
  }
  return out;
}

export default function VaultPage() {
  const ref = useGsapEntrance();
  const [index, setIndex] = useState<VaultIndexResponse | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [revealPath, setRevealPath] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [view, setView] = useState<"list" | "graph">("list");
  const [graph, setGraph] = useState<VaultGraphData | null>(null);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [searchResults, setSearchResults] = useState<VaultSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [newMemoryOpen, setNewMemoryOpen] = useState(false);

  const refreshIndex = useCallback(async () => {
    try {
      const res = await fetch("/api/vault/index");
      if (res.ok) setIndex(await res.json());
    } catch {
      /* keep whatever is already rendered rather than blanking the sidebar */
    }
  }, []);

  useEffect(() => {
    void refreshIndex();
    const timer = setInterval(() => void refreshIndex(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshIndex]);

  // Everything in the tree, flattened once, so a selected path can be mapped
  // back to its DB row (if any) without walking the tree on every render.
  const filesByPath = useRef(new Map<string, VaultTreeFile>());
  useEffect(() => {
    if (!index) return;
    const all = walkFiles(index.folders, [...index.rootFiles]);
    filesByPath.current = new Map(all.map((f) => [f.relPath, f]));
  }, [index]);

  const createNote = useCallback(
    async (title?: string) => {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title ?? "Untitled note", content: "" }),
      });
      const data = await res.json();
      setDetail(null);
      setSelectedPath(null);
      // The vault file does not exist until the Obsidian sync writes it, so open
      // the note by id straight away rather than waiting for the next scan.
      const detailRes = await fetch(`/api/notes/${data.id}`);
      if (detailRes.ok) setDetail({ source: "note", ...(await detailRes.json()) });
      void refreshIndex();
    },
    [refreshIndex]
  );

  // Honor ?vault=notes|memory-bank + ?focus=<rawId> + ?new=1 — the redirect
  // stubs at /dashboard/notes and /dashboard/memory-bank and the command
  // palette both deep-link this way.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vault = params.get("vault");
    const focus = params.get("focus");
    if (focus && vault === "notes") {
      fetch(`/api/notes/${focus}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setDetail({ source: "note", ...data }))
        .catch(() => {});
    } else if (focus && vault === "memory-bank") {
      fetch(`/api/memories/${focus}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setDetail({ source: "memory", ...data }))
        .catch(() => {});
    }
    if (params.get("new") === "1") {
      if (vault === "memory-bank") setNewMemoryOpen(true);
      else void createNote();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    fetch(`/api/vault/search?q=${encodeURIComponent(q)}`)
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((data) => {
        if (cancelled) return;
        setSearchResults(data.results ?? []);
        setSearching(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSearchResults([]);
        setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    if (view !== "graph") return;
    fetch("/api/vault/graph")
      .then((r) => (r.ok ? r.json() : null))
      .then(setGraph)
      .catch(() => setGraph(null));
  }, [view, index]);

  // A vault file that matrix-dash owns opens in its real editor; everything
  // else opens read-only. The mapping lives in the index, not in the path.
  useEffect(() => {
    if (!selectedPath) return;
    const known = filesByPath.current.get(selectedPath);
    let cancelled = false;
    const load = async () => {
      if (known?.noteId) {
        const res = await fetch(`/api/notes/${known.noteId}`);
        if (!cancelled && res.ok) setDetail({ source: "note", ...(await res.json()) });
        return;
      }
      if (known?.memoryId) {
        const res = await fetch(`/api/memories/${known.memoryId}`);
        if (!cancelled && res.ok) setDetail({ source: "memory", ...(await res.json()) });
        return;
      }
      const res = await fetch(`/api/vault/file?path=${encodeURIComponent(selectedPath)}`);
      if (cancelled) return;
      if (!res.ok) {
        setDetail(null);
        return;
      }
      const file: VaultFileDetail = await res.json();
      // The index route and the file route agree on backing, so prefer the
      // file route's answer when the flattened tree is momentarily stale.
      if (file.noteId) {
        const noteRes = await fetch(`/api/notes/${file.noteId}`);
        if (!cancelled && noteRes.ok) setDetail({ source: "note", ...(await noteRes.json()) });
        return;
      }
      if (file.memoryId) {
        const memRes = await fetch(`/api/memories/${file.memoryId}`);
        if (!cancelled && memRes.ok) setDetail({ source: "memory", ...(await memRes.json()) });
        return;
      }
      setDetail({ source: "file", file });
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  const selectPath = useCallback((relPath: string) => {
    setSelectedPath(relPath);
    setRevealPath(relPath);
  }, []);

  const navigateNoteTitle = async (title: string) => {
    const res = await fetch(`/api/notes?q=${encodeURIComponent(title)}`);
    const found: Note[] = res.ok ? await res.json() : [];
    const match = found.find((n) => n.title.toLowerCase() === title.toLowerCase());
    if (match) {
      const detailRes = await fetch(`/api/notes/${match.id}`);
      if (detailRes.ok) setDetail({ source: "note", ...(await detailRes.json()) });
      return;
    }
    await createNote(title);
  };

  const openNoteById = async (id: string) => {
    const res = await fetch(`/api/notes/${id}`);
    if (res.ok) setDetail({ source: "note", ...(await res.json()) });
  };

  const openMemoryById = async (id: string) => {
    const res = await fetch(`/api/memories/${id}`);
    if (res.ok) setDetail({ source: "memory", ...(await res.json()) });
  };

  return (
    <div ref={ref} className="page-h grid grid-cols-1 md:grid-cols-[320px_1fr]">
      {/* Hide sidebar on mobile when a detail is open — show back button instead. */}
      {(!detail || view === "graph") && (
        <VaultSidebar
          index={index}
          searchResults={searchResults}
          searching={searching}
          selectedPath={selectedPath}
          onSelectPath={selectPath}
          query={query}
          onQueryChange={setQuery}
          onNewNote={() => void createNote()}
          onNewMemory={() => setNewMemoryOpen(true)}
          revealPath={revealPath}
        />
      )}

      <section className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-2">
          {/* Mobile back button when viewing a detail */}
          {detail ? (
            <button
              onClick={() => {
                setDetail(null);
                setSelectedPath("");
              }}
              className="text-text-secondary hover:text-text-primary flex items-center gap-1 text-xs transition-colors md:hidden"
            >
              <ArrowLeft size={13} /> Back to vault
            </button>
          ) : (
            <span className="text-text-muted truncate text-[11px]">
              {index ? `${index.fileCount} files` : ""}
            </span>
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
                    onSelect={(relPath) => {
                      selectPath(relPath);
                      setView("list");
                    }}
                  />
                ) : (
                  <div className="grid h-full place-items-center">
                    <EmptyState
                      icon={<Network size={16} />}
                      title="No graph yet"
                      description="Nothing in the vault is indexed yet, or nothing links to anything. Connect files with [[wiki links]]."
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
              onChange={refreshIndex}
              onNavigateTitle={navigateNoteTitle}
              onNavigateId={(id) => void openNoteById(id)}
            />
          ) : detail?.source === "memory" ? (
            <div className="mx-auto max-w-2xl p-4 md:p-6">
              <MemoryDetail
                memory={detail.memory}
                links={detail.links}
                onChange={refreshIndex}
                onSelectLinked={(id) => void openMemoryById(id)}
              />
            </div>
          ) : detail?.source === "file" ? (
            <VaultFileViewer
              key={detail.file.relPath}
              file={detail.file}
              vaultName={index?.vaultName ?? null}
              onSelectPath={selectPath}
            />
          ) : (
            <div className="grid h-full place-items-center p-8">
              <EmptyState
                icon={<FileText size={16} />}
                title="Nothing selected"
                description="Pick a file from the vault on the left, or search across every folder."
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
        onCreated={refreshIndex}
      />
    </div>
  );
}
