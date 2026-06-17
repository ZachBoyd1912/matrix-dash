"use client";

import { useState, useRef, useCallback, memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertCircle,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { KanbanTask, Project } from "@/types/jarvis";

// ── Project Color System ────────────────────────────────────────────
const PROJECT_COLORS: Record<string, { left: string; badge: string }> = {
  "matrix-dash":               { left: "border-l-emerald-400",   badge: "bg-emerald-400/10 border-emerald-400/30 text-emerald-300" },
  "bolt-new-custom":           { left: "border-l-blue-400",      badge: "bg-blue-400/10 border-blue-400/30 text-blue-300" },
  "antigravity-awesome-skills":{ left: "border-l-purple-400",    badge: "bg-purple-400/10 border-purple-400/30 text-purple-300" },
  "odysseus":                  { left: "border-l-indigo-400",    badge: "bg-indigo-400/10 border-indigo-400/30 text-indigo-300" },
  "fansly-ai-automation":      { left: "border-l-pink-400",      badge: "bg-pink-400/10 border-pink-400/30 text-pink-300" },
  "youtube-pipeline":          { left: "border-l-rose-400",      badge: "bg-rose-400/10 border-rose-400/30 text-rose-300" },
  "bolt-new-original":         { left: "border-l-sky-400",       badge: "bg-sky-400/10 border-sky-400/30 text-sky-300" },
  "bolt-projects":             { left: "border-l-cyan-400",      badge: "bg-cyan-400/10 border-cyan-400/30 text-cyan-300" },
  "forevergrateful":           { left: "border-l-orange-400",    badge: "bg-orange-400/10 border-orange-400/30 text-orange-300" },
  "tgf-landing-page":          { left: "border-l-yellow-400",    badge: "bg-yellow-400/10 border-yellow-400/30 text-yellow-300" },
  "make-blueprints-ready":     { left: "border-l-teal-400",      badge: "bg-teal-400/10 border-teal-400/30 text-teal-300" },
  "the-greater-flaw":          { left: "border-l-slate-400",     badge: "bg-slate-400/10 border-slate-400/30 text-slate-300" },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "text-text-muted",
  normal: "text-text-secondary",
  high: "text-amber-400",
  urgent: "text-rose-400",
};

// ── Helpers ─────────────────────────────────────────────────────────
function isOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false;
  return new Date(dueAt) < new Date();
}

function isToday(dueAt: string | null): boolean {
  if (!dueAt) return false;
  const d = new Date(dueAt);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// ── Component ──────────────────────────────────────────────────────
interface Props {
  task: KanbanTask;
  project?: Project;
  prevColumn: string | null;
  nextColumn: string | null;
  onClick: () => void;
  onInlineEdit: (id: string, title: string) => Promise<void>;
  onQuickToggle: (id: string, direction: "prev" | "next") => void;
}

export const KanbanCard = memo(function KanbanCard({
  task,
  project,
  prevColumn,
  nextColumn,
  onClick,
  onInlineEdit,
  onQuickToggle,
}: Props) {
  // Sortable
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

  // Inline editing
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // don't open dialog
      setEditValue(task.title);
      setEditing(true);
      requestAnimationFrame(() => inputRef.current?.select());
    },
    [task.title]
  );

  const cancelEdit = useCallback(
    (e?: React.MouseEvent | React.KeyboardEvent) => {
      e?.stopPropagation();
      setEditing(false);
      setEditValue(task.title);
    },
    [task.title]
  );

  const saveEdit = useCallback(
    async (e?: React.MouseEvent | React.KeyboardEvent) => {
      e?.stopPropagation();
      const trimmed = editValue.trim();
      if (!trimmed || trimmed === task.title) {
        setEditing(false);
        setEditValue(task.title);
        return;
      }
      setSaving(true);
      try {
        await onInlineEdit(task.id, trimmed);
      } finally {
        setSaving(false);
        setEditing(false);
      }
    },
    [editValue, task.id, task.title, onInlineEdit]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") saveEdit();
      if (e.key === "Escape") cancelEdit();
    },
    [saveEdit, cancelEdit]
  );

  // Due date display
  const dueOverdue = isOverdue(task.dueAt);
  const dueToday = isToday(task.dueAt);
  const dueLabel = task.dueAt
    ? new Date(task.dueAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  // Project colors
  const colors = project ? PROJECT_COLORS[project.id] : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "glass rounded-lg border border-white/5 group transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:border-white/10 hover:translate-y-[-1px] hover:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.5)]",
        colors?.left ?? "border-l-white/10",
        isDragging &&
          "opacity-50 rotate-[2deg] scale-105 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.7)] z-50",
        editing && "ring-1 ring-emerald-400/40"
      )}
      onClick={(e) => { if (!editing) onClick(); }}
    >
      <div className="p-3">
        {/* ── Top row: project badge + toggle arrows ── */}
        <div className="flex items-center justify-between mb-2">
          {project ? (
            <span
              className={cn(
                "text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border",
                colors?.badge ?? "border-white/10 text-text-muted bg-white/5"
              )}
            >
              {project.name.length > 16
                ? project.name.slice(0, 14) + "…"
                : project.name}
            </span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onQuickToggle(task.id, "prev");
              }}
              disabled={!prevColumn}
              className={cn(
                "p-0.5 rounded transition-colors",
                prevColumn
                  ? "text-text-muted hover:text-white hover:bg-white/10"
                  : "text-text-muted/20 cursor-not-allowed"
              )}
              title={prevColumn ? `Move to ${prevColumn}` : "End of board"}
              aria-label="Move left"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onQuickToggle(task.id, "next");
              }}
              disabled={!nextColumn}
              className={cn(
                "p-0.5 rounded transition-colors",
                nextColumn
                  ? "text-text-muted hover:text-white hover:bg-white/10"
                  : "text-text-muted/20 cursor-not-allowed"
              )}
              title={nextColumn ? `Move to ${nextColumn}` : "End of board"}
              aria-label="Move right"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>

        {/* ── Title (inline editable) ── */}
        <div className="flex items-start gap-1.5">
          {/* Drag handle */}
          <button
            className="mt-0.5 text-text-muted hover:text-white opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-grab active:cursor-grabbing p-0 -ml-0.5"
            {...attributes}
            {...listeners}
            aria-label="Drag task"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={13} />
          </button>

          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={() => saveEdit()}
                  className="glass-input w-full h-6 px-1.5 rounded text-[13px] font-medium text-text-primary outline-none"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); saveEdit(); }}
                  disabled={saving}
                  className="text-emerald-400 hover:text-emerald-300 p-0.5 rounded shrink-0"
                  aria-label="Save"
                >
                  <Check size={12} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); cancelEdit(e); }}
                  className="text-text-muted hover:text-rose-400 p-0.5 rounded shrink-0"
                  aria-label="Cancel"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <p
                onClick={startEdit}
                className="text-[13px] font-medium text-text-primary leading-snug cursor-text hover:text-emerald-300 transition-colors"
                title="Click to edit"
              >
                {task.title}
              </p>
            )}

            {!editing && task.notes && (
              <p className="text-[11px] text-text-muted mt-1 line-clamp-2 leading-relaxed">
                {task.notes}
              </p>
            )}
          </div>
        </div>

        {/* ── Footer: due date + priority ── */}
        <div className="flex items-center gap-2 mt-2.5 text-[10px]">
          {dueLabel && (
            <span
              className={cn(
                "flex items-center gap-1",
                dueOverdue && "text-rose-400 font-medium",
                dueToday && !dueOverdue && "text-amber-400 font-medium",
                !dueOverdue && !dueToday && "text-text-muted"
              )}
            >
              <Calendar size={10} className={cn(dueOverdue && "animate-pulse")} />
              {dueLabel}
              {dueOverdue && <span className="text-[9px]">overdue</span>}
              {dueToday && !dueOverdue && <span className="text-[9px]">today</span>}
            </span>
          )}
          {task.priority !== "normal" && (
            <span className={cn("flex items-center gap-0.5 ml-auto", PRIORITY_COLORS[task.priority])}>
              <AlertCircle size={9} />
              {task.priority}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
