export type MemoryType = "identity" | "project" | "global" | "lesson";

export interface Memory {
  id: string;
  content: string;
  type: MemoryType;
  tags: string;
  importance: number;
  usageCount: number;
  source: string | null;
  embedding: string | null;
  isPinned: boolean | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface MemoryLink {
  id: string;
  sourceMemoryId: string;
  targetMemoryId: string;
  strength: number;
  createdAt: string;
}

export interface LinkedMemory {
  linkId: string;
  direction: "outgoing" | "incoming";
  strength: number;
  memory: Pick<Memory, "id" | "content" | "type">;
}

export const MEMORY_TYPES: MemoryType[] = ["identity", "project", "global", "lesson"];

export const MEMORY_TYPE_META: Record<
  MemoryType,
  { label: string; color: string; bg: string; border: string }
> = {
  identity: {
    label: "Identity",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/20",
  },
  project: {
    label: "Project",
    color: "text-sky-400",
    bg: "bg-sky-400/10",
    border: "border-sky-400/20",
  },
  global: {
    label: "Global",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/20",
  },
  lesson: {
    label: "Lesson",
    color: "text-rose-400",
    bg: "bg-rose-400/10",
    border: "border-rose-400/20",
  },
};
