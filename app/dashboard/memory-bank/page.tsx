"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus, Wand2, Network, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { MemoryCard } from "@/components/memory-bank/memory-card";
import { MemoryDetail } from "@/components/memory-bank/memory-detail";
import { MemoryGraph } from "@/components/memory-bank/memory-graph";
import { NewMemoryDialog } from "@/components/memory-bank/new-memory-dialog";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { MEMORY_TYPES, MEMORY_TYPE_META, type LinkedMemory, type Memory, type MemoryType } from "@/types/memory";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { cn } from "@/lib/utils/cn";
import { toast } from "@/lib/stores/use-feedback";

interface GraphData {
  nodes: { id: string; label: string; type: MemoryType; importance: number; usageCount: number; isPinned: boolean }[];
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
    fetch("/api/memories/graph").then((r) => r.json()).then(setGraph).catch(() => setGraph(null));
  }, [view, memories]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    fetch(`/api/memories/${selectedId}`).then((r) => {
      if (!r.ok) return null;
      return r.json();
    }).then((data) => setDetail(data)).catch(() => setDetail(null));
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
      <div className="px-4 md:px-6 py-4 border-b border-white/5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memories…"
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-1 glass-input rounded-md p-0.5">
          {(["all", ...MEMORY_TYPES] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "h-7 px-3 rounded-[5px] text-[11px] capitalize transition-colors",
                filter === t
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              {t === "all" ? "All" : MEMORY_TYPE_META[t].label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 glass-input rounded-md p-0.5">
          <button
            onClick={() => setView("list")}
            className={cn(
              "h-7 px-2 rounded-[5px] transition-colors",
              view === "list" ? "bg-white/10 text-text-primary" : "text-text-muted hover:text-text-secondary"
            )}
            aria-label="List view"
          >
            <List size={13} />
          </button>
          <button
            onClick={() => setView("graph")}
            className={cn(
              "h-7 px-2 rounded-[5px] transition-colors",
              view === "graph" ? "bg-white/10 text-text-primary" : "text-text-muted hover:text-text-secondary"
            )}
            aria-label="Graph view"
          >
            <Network size={13} />
          </button>
        </div>

        <Button variant="outline" size="sm" onClick={tidy} disabled={tidying}>
          <Wand2 size={13} /> {tidying ? "Tidying…" : "Tidy"}
        </Button>
        <Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus size={13} /> New
        </Button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px]">
        <div className="border-r border-white/5 overflow-hidden">
          {view === "list" ? (
            <div className="h-full overflow-y-auto p-4 md:p-6">
              {memories === null ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  title="No memories yet"
                  description="Chat with the AI or click New — memories are extracted automatically after every reply."
                  action={<Button variant="primary" size="sm" onClick={() => setDialogOpen(true)}><Plus size={13} /> New memory</Button>}
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filtered.map((m) => (
                    <MemoryCard
                      key={m.id}
                      memory={m}
                      selected={selectedId === m.id}
                      onSelect={() => setSelectedId(m.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="h-full p-4">
              <div className="glass rounded-xl h-full overflow-hidden">
                {graph && graph.nodes.length > 0 ? (
                  <MemoryGraph data={graph} onSelect={setSelectedId} />
                ) : (
                  <EmptyState title="No graph yet" description="Add memories and links will form automatically." />
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="overflow-y-auto p-4 md:p-6 bg-white/[0.01]">
          {detail ? (
            <MemoryDetail
              memory={detail.memory}
              links={detail.links}
              onChange={refresh}
              onSelectLinked={(id) => setSelectedId(id)}
            />
          ) : (
            <EmptyState title="No memory selected" description="Click a card to see its details and connections." />
          )}
        </aside>
      </div>

      <NewMemoryDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={refresh}
      />
    </div>
  );
}
