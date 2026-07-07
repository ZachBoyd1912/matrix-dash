"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus, Wand2, Network, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { VirtuosoGrid } from "react-virtuoso";
import { MemoryCard } from "@/components/memory-bank/memory-card";
import { MemoryDetail } from "@/components/memory-bank/memory-detail";
import { MemoryGraph } from "@/components/memory-bank/memory-graph-lazy";
import { NewMemoryDialog } from "@/components/memory-bank/new-memory-dialog";
import { useDebounce } from "@/lib/hooks/use-debounce";
import {
  MEMORY_TYPES,
  MEMORY_TYPE_META,
  type LinkedMemory,
  type Memory,
  type MemoryType,
} from "@/types/memory";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { cn } from "@/lib/utils/cn";
import { toast } from "@/lib/stores/use-feedback";

interface GraphData {
  nodes: {
    id: string;
    label: string;
    type: MemoryType;
    importance: number;
    usageCount: number;
    isPinned: boolean;
  }[];
  links: { id: string; source: string; target: string; strength: number }[];
}

export default function MemoryBankPage() {
  const ref = useGsapEntrance();
  const [memories, setMemories] = useState<Memory[] | null>(null);
  const [filter, setFilter] = useState<MemoryType | "all">("all");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ memory: Memory; links: LinkedMemory[] } | null>(null);
  const [view, setView] = useState<"list" | "graph">("list");
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tidying, setTidying] = useState(false);

  // Honor ?focus=<id> and ?new=1 deep links (command palette).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const focus = params.get("focus");
    if (focus) setSelectedId(focus);
    if (params.get("new") === "1") setDialogOpen(true);
  }, []);

  const refresh = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("type", filter);
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    const res = await fetch(`/api/memories?${params}`);
    const data = await res.json();
    setMemories(data);
    if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
  }, [filter, debouncedQuery, selectedId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (view !== "graph") return;
    fetch("/api/memories/graph")
      .then((r) => r.json())
      .then(setGraph)
      .catch(() => setGraph(null));
  }, [view, memories]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    fetch(`/api/memories/${selectedId}`)
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => setDetail(data))
      .catch(() => setDetail(null));
  }, [selectedId]);

  const filtered = useMemo(() => memories ?? [], [memories]);

  const tidy = async () => {
    setTidying(true);
    try {
      const res = await fetch("/api/memories/tidy", { method: "POST" });
      const data = await res.json();
      toast.success("Tidy complete", `${data.tidy.merged} merged, ${data.tidy.deleted} removed.`);
      await refresh();
    } finally {
      setTidying(false);
    }
  };

  return (
    <div ref={ref} className="page-h flex flex-col">
      <div className="relative flex flex-wrap items-center gap-3 overflow-hidden border-b border-white/5 px-4 py-4 md:px-6">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" aria-hidden />
        <div
          className="orb -top-12 right-24 h-40 w-40 bg-sky-500/15"
          style={{ animationDelay: "-6s" }}
          aria-hidden
        />
        <div className="relative z-10 max-w-md min-w-[200px] flex-1">
          <Search size={14} className="text-text-muted absolute top-1/2 left-3 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memories…"
            aria-label="Search memories"
            className="pl-9"
          />
        </div>

        <div className="glass-input relative z-10 flex items-center gap-1 rounded-md p-0.5">
          {(["all", ...MEMORY_TYPES] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "h-7 rounded-[5px] px-3 text-[11px] capitalize transition-colors",
                filter === t
                  ? "text-text-primary bg-white/10"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              {t === "all" ? "All" : MEMORY_TYPE_META[t].label}
            </button>
          ))}
        </div>

        <div className="glass-input relative z-10 flex items-center gap-1 rounded-md p-0.5">
          <button
            onClick={() => setView("list")}
            className={cn(
              "h-7 rounded-[5px] px-2 transition-colors",
              view === "list"
                ? "text-text-primary bg-white/10"
                : "text-text-muted hover:text-text-secondary"
            )}
            aria-label="List view"
          >
            <List size={13} />
          </button>
          <button
            onClick={() => setView("graph")}
            className={cn(
              "h-7 rounded-[5px] px-2 transition-colors",
              view === "graph"
                ? "text-text-primary bg-white/10"
                : "text-text-muted hover:text-text-secondary"
            )}
            aria-label="Graph view"
          >
            <Network size={13} />
          </button>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={tidy}
          disabled={tidying}
          className="relative z-10"
        >
          <Wand2 size={13} /> {tidying ? "Tidying…" : "Tidy"}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="relative z-10"
        >
          <Plus size={13} /> New
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_360px]">
        <div className="overflow-hidden border-r border-white/5">
          {view === "list" ? (
            <div className="h-full p-4 md:p-6">
              {memories === null ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  title="No memories yet"
                  description="Chat with the AI or click New — memories are extracted automatically after every reply."
                  action={
                    <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
                      <Plus size={13} /> New memory
                    </Button>
                  }
                />
              ) : (
                <VirtuosoGrid
                  style={{ height: "100%" }}
                  data={filtered}
                  listClassName="grid grid-cols-1 gap-3 sm:grid-cols-2"
                  itemContent={(_, m) => (
                    <MemoryCard
                      memory={m}
                      selected={selectedId === m.id}
                      onSelect={() => setSelectedId(m.id)}
                    />
                  )}
                />
              )}
            </div>
          ) : (
            <div className="h-full p-4">
              <div className="glass h-full overflow-hidden rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                {graph && graph.nodes.length > 0 ? (
                  <MemoryGraph data={graph} onSelect={setSelectedId} />
                ) : (
                  <EmptyState
                    title="No graph yet"
                    description="Add memories and links will form automatically."
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="overflow-y-auto bg-white/[0.01] p-4 md:p-6">
          {detail ? (
            <MemoryDetail
              memory={detail.memory}
              links={detail.links}
              onChange={refresh}
              onSelectLinked={(id) => setSelectedId(id)}
            />
          ) : (
            <EmptyState
              title="No memory selected"
              description="Click a card to see its details and connections."
            />
          )}
        </aside>
      </div>

      <NewMemoryDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreated={refresh} />
    </div>
  );
}
