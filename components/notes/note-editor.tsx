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
    if (!confirm("Delete this note?")) return;
    await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
    onChange();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 md:px-6 py-3 border-b border-white/5 flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => updateTitle(e.target.value)}
          className="flex-1 h-9 text-base font-semibold border-transparent bg-transparent focus:bg-white/[0.03]"
          placeholder="Untitled note"
        />
        <span className="text-[10px] text-text-muted">
          saved {timeAgo(savedAt ?? note.updatedAt)}
        </span>
        <div className="flex items-center gap-1 glass-input rounded-md p-0.5">
          <button
            onClick={() => setTab("edit")}
            className={cn(
              "h-7 px-2 rounded-[5px] transition-colors",
              tab === "edit" ? "bg-white/10 text-text-primary" : "text-text-muted hover:text-text-secondary"
            )}
            aria-label="Edit mode"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={() => setTab("preview")}
            className={cn(
              "h-7 px-2 rounded-[5px] transition-colors",
              tab === "preview" ? "bg-white/10 text-text-primary" : "text-text-muted hover:text-text-secondary"
            )}
            aria-label="Preview mode"
          >
            <Eye size={12} />
          </button>
        </div>
        <Button size="icon" variant="ghost" onClick={toggleFavorite} aria-label="Favorite">
          <Star size={14} className={note.isFavorite ? "text-amber-400 fill-amber-400/30" : ""} />
        </Button>
        <Button size="icon" variant="ghost" onClick={remove} aria-label="Delete">
          <Trash2 size={14} className="text-rose-400" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_280px]">
        <div className="overflow-y-auto p-4 md:p-6">
          {tab === "edit" ? (
            <textarea
              value={content}
              onChange={(e) => updateContent(e.target.value)}
              className="w-full min-h-[70vh] bg-transparent text-sm font-mono leading-relaxed focus:outline-none resize-none text-text-primary placeholder:text-text-muted"
              placeholder="Start writing… use [[Title]] for wiki links."
            />
          ) : (
            <WikiContent content={content} onNavigate={onNavigateTitle} />
          )}
        </div>
        <aside className="border-l border-white/5 overflow-y-auto p-4 bg-white/[0.01]">
          <div className="text-[10px] uppercase text-text-muted mb-2">Outgoing links</div>
          {backlinks.outgoing.length === 0 ? (
            <p className="text-xs text-text-muted mb-4">none</p>
          ) : (
            <ul className="space-y-1 mb-4">
              {backlinks.outgoing.map((l) => (
                <li
                  key={l.linkId}
                  onClick={() => onNavigateId(l.note.id)}
                  className="text-xs text-text-secondary hover:text-emerald-400 cursor-pointer py-1 px-2 rounded hover:bg-white/5 truncate"
                >
                  → {l.note.title || "Untitled"}
                </li>
              ))}
            </ul>
          )}
          <div className="text-[10px] uppercase text-text-muted mb-2">Backlinks</div>
          {backlinks.incoming.length === 0 ? (
            <p className="text-xs text-text-muted">none</p>
          ) : (
            <ul className="space-y-1">
              {backlinks.incoming.map((l) => (
                <li
                  key={l.linkId}
                  onClick={() => onNavigateId(l.note.id)}
                  className="text-xs text-text-secondary hover:text-emerald-400 cursor-pointer py-1 px-2 rounded hover:bg-white/5 truncate"
                >
                  ← {l.note.title || "Untitled"}
                </li>
              ))}
            </ul>
          )}
          {note.tags && (
            <>
              <div className="text-[10px] uppercase text-text-muted mt-4 mb-2">Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {note.tags.split(",").filter(Boolean).map((t) => (
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
