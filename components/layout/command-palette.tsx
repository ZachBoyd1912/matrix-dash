"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Sparkles,
  MessageSquare,
  BrainCircuit,
  FileText,
  Layers,
  Code2,
  Settings,
  Plus,
} from "lucide-react";
import { useAppStore } from "@/lib/stores/use-app-store";
import { useShortcut } from "@/lib/hooks/use-shortcut";
import { useDebounce } from "@/lib/hooks/use-debounce";
import type { Memory } from "@/types/memory";
import type { Note } from "@/types/note";

interface SearchHit {
  memories: Memory[];
  notes: Note[];
}

export function CommandPalette() {
  const router = useRouter();
  const open = useAppStore((s) => s.commandOpen);
  const setOpen = useAppStore((s) => s.setCommandOpen);
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 200);
  const [hits, setHits] = useState<SearchHit>({ memories: [], notes: [] });

  useShortcut({
    key: "k",
    meta: true,
    handler: (e) => {
      e.preventDefault();
      setOpen(!open);
    },
  });

  useEffect(() => {
    if (!debounced) {
      setHits({ memories: [], notes: [] });
      return;
    }
    let canceled = false;
    fetch(`/api/search?q=${encodeURIComponent(debounced)}`)
      .then((r) => r.json())
      .then((data: SearchHit) => {
        if (!canceled) setHits(data);
      })
      .catch(() => {
        if (!canceled) setHits({ memories: [], notes: [] });
      });
    return () => {
      canceled = true;
    };
  }, [debounced]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start pt-28 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <Command
        label="Command Palette"
        shouldFilter={false}
        className="relative glass-strong w-full max-w-xl rounded-2xl overflow-hidden"
      >
        <Command.Input
          value={query}
          onValueChange={setQuery}
          autoFocus
          placeholder="Search memories, notes, navigate…"
          className="w-full h-14 bg-transparent px-5 text-sm text-text-primary placeholder:text-text-muted border-b border-white/5 focus:outline-none"
        />
        <Command.List className="max-h-[400px] overflow-y-auto p-2">
          <Command.Empty className="py-8 text-center text-xs text-text-muted">
            {debounced ? "No results." : "Start typing to search."}
          </Command.Empty>

          <Command.Group heading="Navigate" className="text-[10px] uppercase tracking-wider text-text-muted px-2 py-1">
            <PaletteItem onSelect={() => go("/dashboard")} icon={<Sparkles size={14} />} label="Overview" hint="dashboard" />
            <PaletteItem onSelect={() => go("/dashboard/chat")} icon={<MessageSquare size={14} />} label="Chat" hint="ask AI" />
            <PaletteItem onSelect={() => go("/dashboard/memory-bank")} icon={<BrainCircuit size={14} />} label="Memory Bank" hint="autonomous memory" />
            <PaletteItem onSelect={() => go("/dashboard/notes")} icon={<FileText size={14} />} label="Notes" hint="wiki notes" />
            <PaletteItem onSelect={() => go("/dashboard/sessions")} icon={<Layers size={14} />} label="Sessions" hint="conversation log" />
            <PaletteItem onSelect={() => go("/dashboard/ide")} icon={<Code2 size={14} />} label="IDE" hint="code editor" />
            <PaletteItem onSelect={() => go("/dashboard/settings")} icon={<Settings size={14} />} label="Settings" hint="config" />
          </Command.Group>

          {hits.memories.length > 0 && (
            <Command.Group heading="Memories" className="text-[10px] uppercase tracking-wider text-text-muted px-2 py-1 mt-2">
              {hits.memories.slice(0, 5).map((m) => (
                <PaletteItem
                  key={m.id}
                  onSelect={() => go(`/dashboard/memory-bank?focus=${m.id}`)}
                  icon={<BrainCircuit size={14} />}
                  label={m.content.slice(0, 60)}
                  hint={m.type}
                />
              ))}
            </Command.Group>
          )}

          {hits.notes.length > 0 && (
            <Command.Group heading="Notes" className="text-[10px] uppercase tracking-wider text-text-muted px-2 py-1 mt-2">
              {hits.notes.slice(0, 5).map((n) => (
                <PaletteItem
                  key={n.id}
                  onSelect={() => go(`/dashboard/notes?focus=${n.id}`)}
                  icon={<FileText size={14} />}
                  label={n.title || "Untitled"}
                  hint="note"
                />
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Actions" className="text-[10px] uppercase tracking-wider text-text-muted px-2 py-1 mt-2">
            <PaletteItem onSelect={() => go("/dashboard/memory-bank?new=1")} icon={<Plus size={14} />} label="New memory" hint="capture fact" />
            <PaletteItem onSelect={() => go("/dashboard/notes?new=1")} icon={<Plus size={14} />} label="New note" hint="wiki note" />
            <PaletteItem onSelect={() => go("/dashboard/sessions?new=1")} icon={<Plus size={14} />} label="New session" hint="start chat" />
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}

interface ItemProps {
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
}

function PaletteItem({ onSelect, icon, label, hint }: ItemProps) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 h-9 rounded-md text-sm text-text-secondary aria-selected:bg-white/[0.06] aria-selected:text-text-primary cursor-pointer transition-colors"
    >
      <span className="text-text-muted">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-[10px] text-text-muted">{hint}</span>}
    </Command.Item>
  );
}
