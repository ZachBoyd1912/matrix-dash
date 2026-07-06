"use client";

import { useEffect, useRef, useState } from "react";
import { Star, Trash2, Eye, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { WikiContent } from "./wiki-content";
import type { Note, NoteBacklinks } from "@/types/note";
import { timeAgo } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import { toast, confirm } from "@/lib/stores/use-feedback";

interface Props {
  note: Note;
  backlinks: NoteBacklinks;
  onChange: () => void;
  onNavigateTitle: (title: string) => void;
  onNavigateId: (id: string) => void;
}

export function NoteEditor({ note, backlinks, onChange, onNavigateTitle, onNavigateId }: Props) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(note.updatedAt);

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
    setSavedAt(note.updatedAt);
  }, [note.id, note.title, note.content, note.updatedAt]);

  const persist = (next: Partial<Note>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      setSavedAt(new Date().toISOString());
      onChange();
    }, 600);
  };

  const updateTitle = (v: string) => {
    setTitle(v);
    persist({ title: v });
  };

  const updateContent = (v: string) => {
    setContent(v);
    persist({ content: v });
  };

  const toggleFavorite = async () => {
    await fetch(`/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isFavorite: !note.isFavorite }),
    });
    onChange();
  };

  const remove = async () => {
    const ok = await confirm({
      title: "Delete this note?",
      description: "Backlinks pointing at it will be removed.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
    toast.success("Note deleted");
    onChange();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3 md:px-6">
        <Input
          value={title}
          onChange={(e) => updateTitle(e.target.value)}
          className="h-9 flex-1 border-transparent bg-transparent text-base font-semibold focus:bg-white/[0.03]"
          placeholder="Untitled note"
        />
        <span className="text-text-muted text-[10px]">
          saved {timeAgo(savedAt ?? note.updatedAt)}
        </span>
        <div className="glass-input flex items-center gap-1 rounded-md p-0.5">
          <button
            onClick={() => setTab("edit")}
            className={cn(
              "h-7 rounded-[5px] px-2 transition-colors",
              tab === "edit"
                ? "text-text-primary bg-white/10"
                : "text-text-muted hover:text-text-secondary"
            )}
            aria-label="Edit mode"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={() => setTab("preview")}
            className={cn(
              "h-7 rounded-[5px] px-2 transition-colors",
              tab === "preview"
                ? "text-text-primary bg-white/10"
                : "text-text-muted hover:text-text-secondary"
            )}
            aria-label="Preview mode"
          >
            <Eye size={12} />
          </button>
        </div>
        <Button size="icon" variant="ghost" onClick={toggleFavorite} aria-label="Favorite">
          <Star size={14} className={note.isFavorite ? "fill-amber-400/30 text-amber-400" : ""} />
        </Button>
        <Button size="icon" variant="ghost" onClick={remove} aria-label="Delete">
          <Trash2 size={14} className="text-rose-400" />
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_280px]">
        <div className="overflow-y-auto p-4 md:p-6">
          {tab === "edit" ? (
            <textarea
              value={content}
              onChange={(e) => updateContent(e.target.value)}
              className="text-text-primary placeholder:text-text-muted min-h-[70vh] w-full resize-none bg-transparent font-mono text-sm leading-relaxed focus:outline-none"
              placeholder="Start writing… use [[Title]] for wiki links."
            />
          ) : (
            <WikiContent content={content} onNavigate={onNavigateTitle} />
          )}
        </div>
        <aside className="overflow-y-auto border-l border-white/5 bg-white/[0.01] p-4">
          <div className="text-text-muted mb-2 text-[10px] uppercase">Outgoing links</div>
          {backlinks.outgoing.length === 0 ? (
            <p className="text-text-muted mb-4 text-xs">none</p>
          ) : (
            <ul className="mb-4 space-y-1">
              {backlinks.outgoing.map((l) => (
                <li
                  key={l.linkId}
                  onClick={() => onNavigateId(l.note.id)}
                  className="text-text-secondary cursor-pointer truncate rounded px-2 py-1 text-xs hover:bg-white/5 hover:text-emerald-400"
                >
                  → {l.note.title || "Untitled"}
                </li>
              ))}
            </ul>
          )}
          <div className="text-text-muted mb-2 text-[10px] uppercase">Backlinks</div>
          {backlinks.incoming.length === 0 ? (
            <p className="text-text-muted text-xs">none</p>
          ) : (
            <ul className="space-y-1">
              {backlinks.incoming.map((l) => (
                <li
                  key={l.linkId}
                  onClick={() => onNavigateId(l.note.id)}
                  className="text-text-secondary cursor-pointer truncate rounded px-2 py-1 text-xs hover:bg-white/5 hover:text-emerald-400"
                >
                  ← {l.note.title || "Untitled"}
                </li>
              ))}
            </ul>
          )}
          {note.tags && (
            <>
              <div className="text-text-muted mt-4 mb-2 text-[10px] uppercase">Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {note.tags
                  .split(",")
                  .filter(Boolean)
                  .map((t) => (
                    <Badge key={t}>{t.trim()}</Badge>
                  ))}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
