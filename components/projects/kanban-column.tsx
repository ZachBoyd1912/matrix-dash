"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { KanbanCard } from "./kanban-card";
import type { KanbanTask, Project } from "@/types/jarvis";

export interface ColumnDef {
  id: string;
  label: string;
  accent: string;
}

const COLUMN_IDS = ["backlog", "planned", "in-progress", "developed", "tested", "completed"];

function getAdjacentCols(status: string): { prev: string | null; next: string | null } {
  const idx = COLUMN_IDS.indexOf(status);
  return {
    prev: idx > 0 ? COLUMN_IDS[idx - 1] : null,
    next: idx < COLUMN_IDS.length - 1 ? COLUMN_IDS[idx + 1] : null,
  };
}

const COLUMN_LABELS: Record<string, string> = {
  backlog: "Backlog",
  planned: "Planned",
  "in-progress": "In Progress",
  developed: "Developed",
  tested: "Tested",
  completed: "Completed",
};

interface Props {
  column: ColumnDef;
  tasks: KanbanTask[];
  projects: Project[];
  onAddTask: (status: string) => void;
  onEditTask: (task: KanbanTask) => void;
  onInlineEdit: (id: string, title: string) => Promise<void>;
  onQuickToggle: (id: string, direction: "prev" | "next") => void;
  isLast: boolean;
}

export function KanbanColumn({
  column,
  tasks,
  projects,
  onAddTask,
  onEditTask,
  onInlineEdit,
  onQuickToggle,
  isLast,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      className={cn(
        "flex min-h-[400px] flex-col transition-colors duration-200",
        !isLast && "border-r border-white/[0.06]",
        isOver && "bg-emerald-400/[0.04]"
      )}
    >
      {/* ── Drop zone + Add button ── */}
      <div
        ref={setNodeRef}
        className="flex-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent space-y-1.5 overflow-y-auto p-2"
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => {
            const adj = getAdjacentCols(task.kanbanStatus);
            return (
              <KanbanCard
                key={task.id}
                task={task}
                project={projects.find((p) => p.id === task.projectId)}
                prevColumn={adj.prev ? COLUMN_LABELS[adj.prev] : null}
                nextColumn={adj.next ? COLUMN_LABELS[adj.next] : null}
                onClick={() => onEditTask(task)}
                onInlineEdit={onInlineEdit}
                onQuickToggle={onQuickToggle}
              />
            );
          })}
        </SortableContext>

        {tasks.length === 0 && !isOver && (
          <div className="text-text-muted/30 mx-1 flex h-20 items-center justify-center rounded-lg border border-dashed border-white/[0.04] text-center text-[10px]">
            <span>Empty</span>
          </div>
        )}
      </div>

      {/* ── Add task button ── */}
      <div className="border-t border-white/[0.04] p-1.5">
        <button
          onClick={() => onAddTask(column.id)}
          className="text-text-muted flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-[10px] transition-colors hover:bg-emerald-400/[0.06] hover:text-emerald-400"
          aria-label={`Add task to ${column.label}`}
        >
          <Plus size={12} />
          <span>Add</span>
        </button>
      </div>
    </div>
  );
}
