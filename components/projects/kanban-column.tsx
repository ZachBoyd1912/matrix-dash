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

const COLUMN_IDS = ["backlog", "todo", "in-progress", "review", "done", "ab-test"];

function getAdjacentCols(status: string): { prev: string | null; next: string | null } {
  const idx = COLUMN_IDS.indexOf(status);
  return {
    prev: idx > 0 ? COLUMN_IDS[idx - 1] : null,
    next: idx < COLUMN_IDS.length - 1 ? COLUMN_IDS[idx + 1] : null,
  };
}

const COLUMN_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  "in-progress": "In Progress",
  review: "Review",
  done: "Done",
  "ab-test": "AB Test",
};

interface Props {
  column: ColumnDef;
  tasks: KanbanTask[];
  projects: Project[];
  onAddTask: (status: string) => void;
  onEditTask: (task: KanbanTask) => void;
  onInlineEdit: (id: string, title: string) => Promise<void>;
  onQuickToggle: (id: string, direction: "prev" | "next") => void;
}

export function KanbanColumn({
  column,
  tasks,
  projects,
  onAddTask,
  onEditTask,
  onInlineEdit,
  onQuickToggle,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] min-w-[268px] w-[268px] shrink-0",
        isOver
          ? "border-emerald-400/40 bg-emerald-400/[0.06] shadow-[0_0_40px_-12px_rgba(52,211,153,0.15)]"
          : "border-white/5 bg-white/[0.02] hover:border-white/8"
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className={cn("w-2.5 h-2.5 rounded-full shadow-[0_0_8px_currentColor] opacity-80", column.accent)} />
          <span className="text-[11px] font-semibold text-text-primary uppercase tracking-widest">
            {column.label}
          </span>
          <span className="text-[10px] text-text-muted bg-white/5 px-1.5 py-0.5 rounded-full font-medium tabular-nums">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(column.id)}
          className="text-text-muted hover:text-emerald-400 hover:bg-emerald-400/10 p-1 rounded-md transition-colors"
          aria-label={`Add task to ${column.label}`}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Task list */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px] max-h-[440px]",
          "scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-[11px] text-text-muted/40 text-center px-4 border border-dashed border-white/5 rounded-lg">
              <span>Drop tasks here</span>
            </div>
          ) : (
            tasks.map((task) => {
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
            })
          )}
        </SortableContext>
      </div>
    </div>
  );
}
