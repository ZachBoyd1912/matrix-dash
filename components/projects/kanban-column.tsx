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
        "flex flex-col min-h-[400px] transition-colors duration-200",
        !isLast && "border-r border-white/[0.06]",
        isOver && "bg-emerald-400/[0.04]"
      )}
    >
      {/* ── Drop zone + Add button ── */}
      <div
        ref={setNodeRef}
        className="flex-1 p-2 space-y-1.5 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
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
          <div className="flex items-center justify-center h-20 text-[10px] text-text-muted/30 text-center border border-dashed border-white/[0.04] rounded-lg mx-1">
            <span>Empty</span>
          </div>
        )}
      </div>

      {/* ── Add task button ── */}
      <div className="p-1.5 border-t border-white/[0.04]">
        <button
          onClick={() => onAddTask(column.id)}
          className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md text-[10px] text-text-muted hover:text-emerald-400 hover:bg-emerald-400/[0.06] transition-colors"
          aria-label={`Add task to ${column.label}`}
        >
          <Plus size={12} />
          <span>Add</span>
        </button>
      </div>
    </div>
  );
}
