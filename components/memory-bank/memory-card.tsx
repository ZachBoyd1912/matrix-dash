"use client";

import { Pin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MEMORY_TYPE_META, type Memory } from "@/types/memory";
import { timeAgo } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";

interface Props {
  memory: Memory;
  selected?: boolean;
  onSelect: () => void;
}

export function MemoryCard({ memory, selected, onSelect }: Props) {
  const meta = MEMORY_TYPE_META[memory.type];
  return (
    <Card
      onClick={onSelect}
      className={cn(
        "cursor-pointer hover:-translate-y-[1px] hover:bg-white/[0.04]",
        selected && "ring-1 ring-emerald-400/40 bg-white/[0.05]"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm text-text-primary leading-snug line-clamp-2">{memory.content}</p>
        {memory.isPinned && <Pin size={12} className="text-amber-400 shrink-0 mt-1" />}
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[10px]">
        <Badge className={`${meta.bg} ${meta.border} ${meta.color}`}>{meta.label}</Badge>
        <span className="text-text-muted">used {memory.usageCount}×</span>
        <span className="text-text-muted">·</span>
        <span className="text-text-muted">{timeAgo(memory.createdAt)}</span>
      </div>
    </Card>
  );
}
