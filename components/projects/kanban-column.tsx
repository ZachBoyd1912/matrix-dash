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
  accent: string; // Tailwind border class
}

interface Props {
  column: ColumnDef;
  tasks: KanbanTask[];
  projects: Project[];
  onAddTask: (status: string) => void;
  onEditTask: (task: KanbanTask) => void;
}

export function KanbanColumn({ column, tasks, projects, onAddTask, onEditTask }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border transition-all duration-200 min-w-[260px] w-[260px] shrink-0",
        isOver ? "border-emerald-400/40 bg-emerald-400/5" : "border-white/5 bg-white/[0.02]"
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full", column.accent)} />
          <span className="text-xs font-semibold text-text-primary uppercase tracking-wider">
            {column.label}
          </span>
          <span className="text-[10px] text-text-muted bg-white/5 px-1.5 py-0.5 rounded-full font-medium">
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
          "flex-1 p-2 space-y-2 overflow-y-auto min-h-[200px] max-h-[420px]",
          "scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-[11px] text-text-muted text-center px-4">
              <span>Drop tasks here</span>
            </div>
          ) : (
            tasks.map((task) => (
              <KanbanCard
                key={task.id}
                task={task}
                project={projects.find((p) => p.id === task.projectId)}
                onClick={() => onEditTask(task)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}
