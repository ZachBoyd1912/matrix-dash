"use client";

import { forwardRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Calendar, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { KanbanTask, Project } from "@/types/jarvis";

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-text-muted",
  normal: "text-text-secondary",
  high: "text-amber-400",
  urgent: "text-rose-400",
};

interface Props {
  task: KanbanTask;
  project?: Project;
  onClick: () => void;
}

export function KanbanCard({ task, project, onClick }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "glass rounded-lg border border-white/5 cursor-pointer group transition-all duration-200",
        isDragging && "opacity-50 rotate-[3deg] scale-105 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)] z-50"
      )}
      onClick={onClick}
    >
      <div className="p-3">
        {/* Drag handle + title row */}
        <div className="flex items-start gap-2">
          <button
            className="mt-0.5 text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label="Drag task"
          >
            <GripVertical size={12} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-text-primary leading-snug">
              {task.title}
            </p>
            {task.notes && (
              <p className="text-[11px] text-text-muted mt-1 line-clamp-2 leading-relaxed">
                {task.notes}
              </p>
            )}
          </div>
        </div>

        {/* Footer: project badge + priority + due */}
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          {project && (
            <span
              className={cn(
                "text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border",
                "border-white/10 text-text-muted bg-white/5"
              )}
            >
              {project.name.length > 18 ? project.name.slice(0, 16) + "…" : project.name}
            </span>
          )}
          {task.priority !== "normal" && (
            <span className={cn("text-[10px] flex items-center gap-0.5", PRIORITY_COLORS[task.priority])}>
              <AlertCircle size={9} />
              {task.priority}
            </span>
          )}
          {task.dueAt && (
            <span className="text-[10px] text-text-muted flex items-center gap-0.5 ml-auto">
              <Calendar size={9} />
              {new Date(task.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
