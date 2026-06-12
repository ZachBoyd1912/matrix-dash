"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Star, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { NoteEditor } from "@/components/notes/note-editor";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { timeAgo } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import type { Note, NoteBacklinks } from "@/types/note";

export default function NotesPage() {
  const ref = useGsapEntrance();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ note: Note; backlinks: NoteBacklinks } | null>(null);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);

  const refresh = useCallback(async () => {
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    const res = await fetch(`/api/notes?${params}`);
    const data = (await res.json()) as Note[];
    setNotes(data);
    if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
    if (selectedId && !data.find((n) => n.id === selectedId)) {
      setSelectedId(data[0]?.id ?? null);
    }
  }, [debouncedQuery, selectedId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    fetch(`/api/notes/${selectedId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [selectedId]);

  const create = async (title?: string) => {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title ?? "Untitled note", content: "" }),
    });
    const data = await res.json();
    setSelectedId(data.id);
    await refresh();
  };

  const navigateByTitle = async (title: string) => {
    // Try existing notes first.
    const match = (notes ?? []).find((n) => n.title === title);
    if (match) {
      setSelectedId(match.id);
      return;
    }
    // Otherwise create one with this title.
    await create(title);
  };

  return (
    <div ref={ref} className="h-[calc(100vh-3.5rem)] grid grid-cols-1 md:grid-cols-[300px_1fr]">
      <aside className="border-r border-white/5 flex flex-col bg-white/[0.01]">
        <div className="p-3 border-b border-white/5 space-y-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="pl-9 h-9 text-xs"
            />
          </div>
          <Button variant="primary" size="sm" onClick={() => create()} className="w-full">
            <Plus size={13} /> New note
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {notes === null ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)
          ) : notes.length === 0 ? (
            <div className="p-3">
              <EmptyState
                icon={<FileText size={16} />}
                title="No notes yet"
                description="Start your wiki with one click."
                action={
                  <Button variant="primary" size="sm" onClick={() => create()}>
                    <Plus size={13} /> New note
                  </Button>
                }
              />
            </div>
          ) : (
            notes.map((note) => (
              <button
                key={note.id}
                onClick={() => setSelectedId(note.id)}
                className={cn(
                  "w-full text-left p-2 rounded-md transition-colors group",
                  selectedId === note.id
                    ? "bg-white/[0.06] ring-1 ring-emerald-400/20"
                    : "hover:bg-white/[0.03]"
                )}
              >
                <div className="flex items-start gap-2">
                  {note.isFavorite && (
                    <Star size={11} className="text-amber-400 fill-amber-400 mt-1 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-text-primary truncate">
                      {note.title || "Untitled"}
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5 truncate">
                      {note.content.slice(0, 60) || "Empty note"}
                    </p>
                    <p className="text-[10px] text-text-muted mt-0.5">{timeAgo(note.updatedAt)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="min-w-0">
        {detail ? (
          <NoteEditor
            key={detail.note.id}
            note={detail.note}
            backlinks={detail.backlinks}
            onChange={refresh}
            onNavigateTitle={navigateByTitle}
            onNavigateId={setSelectedId}
          />
        ) : (
          <div className="h-full grid place-items-center p-8">
            <EmptyState
              icon={<FileText size={16} />}
              title="No note selected"
              description="Create your first note or pick one from the sidebar."
              action={<Button variant="primary" size="sm" onClick={() => create()}><Plus size={13} /> New note</Button>}
            />
          </div>
        )}
      </section>
    </div>
  );
}
