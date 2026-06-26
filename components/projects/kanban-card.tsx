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
  Bug,
  AlertOctagon,
  Sparkles,
  CircleDot,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { KanbanTask, Project } from "@/types/jarvis";

// ── Work-item Kind System (task | bug | error | feature) ────────────
const KIND_META: Record<string, { icon: LucideIcon; label: string; className: string }> = {
  task:    { icon: CircleDot,     label: "Task",    className: "text-slate-300 bg-slate-400/10" },
  bug:     { icon: Bug,           label: "Bug",     className: "text-rose-300 bg-rose-400/12" },
  error:   { icon: AlertOctagon,  label: "Error",   className: "text-orange-300 bg-orange-400/12" },
  feature: { icon: Sparkles,      label: "Feature", className: "text-emerald-300 bg-emerald-400/12" },
};

// ── Project Color System ────────────────────────────────────────────
const PROJECT_COLORS: Record<string, { border: string; badge: string; bg: string }> = {
  "matrix-dash":               { border: "border-l-emerald-400", badge: "bg-emerald-400/15 text-emerald-300",    bg: "hover:bg-emerald-400/[0.04]" },
  "bolt-new-custom":           { border: "border-l-blue-400",    badge: "bg-blue-400/15 text-blue-300",         bg: "hover:bg-blue-400/[0.04]" },
  "antigravity-awesome-skills":{ border: "border-l-purple-400",  badge: "bg-purple-400/15 text-purple-300",     bg: "hover:bg-purple-400/[0.04]" },
  "odysseus":                  { border: "border-l-indigo-400",  badge: "bg-indigo-400/15 text-indigo-300",     bg: "hover:bg-indigo-400/[0.04]" },
  "fansly-ai-automation":      { border: "border-l-pink-400",    badge: "bg-pink-400/15 text-pink-300",         bg: "hover:bg-pink-400/[0.04]" },
  "youtube-pipeline":          { border: "border-l-rose-400",    badge: "bg-rose-400/15 text-rose-300",         bg: "hover:bg-rose-400/[0.04]" },
  "bolt-new-original":         { border: "border-l-sky-400",     badge: "bg-sky-400/15 text-sky-300",           bg: "hover:bg-sky-400/[0.04]" },
  "bolt-projects":             { border: "border-l-cyan-400",    badge: "bg-cyan-400/15 text-cyan-300",         bg: "hover:bg-cyan-400/[0.04]" },
  "forevergrateful":           { border: "border-l-orange-400",  badge: "bg-orange-400/15 text-orange-300",     bg: "hover:bg-orange-400/[0.04]" },
  "tgf-landing-page":          { border: "border-l-yellow-400",  badge: "bg-yellow-400/15 text-yellow-300",     bg: "hover:bg-yellow-400/[0.04]" },
  "make-blueprints-ready":     { border: "border-l-teal-400",    badge: "bg-teal-400/15 text-teal-300",         bg: "hover:bg-teal-400/[0.04]" },
  "the-greater-flaw":          { border: "border-l-slate-400",   badge: "bg-slate-400/15 text-slate-300",       bg: "hover:bg-slate-400/[0.04]" },
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
      e.stopPropagation();
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

  // Due date
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

  // Work-item kind (task / bug / error / feature)
  const kind = KIND_META[task.kind] ?? KIND_META.task;
  const KindIcon = kind.icon;
  const description = task.notes?.trim();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-lg border border-white/[0.06] border-l-[3px] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "bg-white/[0.03] backdrop-blur-sm",
        "hover:border-white/[0.12] hover:bg-white/[0.05] hover:translate-y-[-1px] hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.4)]",
        colors?.border ?? "border-l-white/20",
        colors?.bg ?? "",
        isDragging &&
          "opacity-40 rotate-[1deg] scale-[1.02] shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)] z-50",
        editing && "ring-1 ring-emerald-400/30"
      )}
      onClick={(e) => { if (!editing) onClick(); }}
    >
      <div className="px-2.5 py-2">
        {/* ── Top: kind + project pill + controls ── */}
        <div className="flex items-center justify-between mb-1.5 gap-1">
          <div className="flex items-center gap-1 min-w-0">
            {/* Kind chip (task / bug / error / feature) */}
            <span
              className={cn(
                "flex items-center gap-0.5 text-[8px] font-semibold uppercase tracking-wider px-1 py-[1px] rounded-full shrink-0",
                kind.className
              )}
              title={kind.label}
            >
              <KindIcon size={8} />
              {kind.label}
            </span>
            {/* Project pill (colour-coded) */}
            {project && (
              <span
                className={cn(
                  "text-[8px] font-semibold uppercase tracking-wider px-1.5 py-[1px] rounded-full truncate",
                  colors?.badge ?? "bg-white/5 text-text-muted"
                )}
              >
                {project.name.length > 14
                  ? project.name.slice(0, 12) + "…"
                  : project.name}
              </span>
            )}
          </div>

          {/* Drag handle + quick toggle — visible on hover */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button
              className="text-text-muted/40 hover:text-white cursor-grab active:cursor-grabbing p-0 -ml-0.5"
              {...attributes}
              {...listeners}
              aria-label="Drag task"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical size={11} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onQuickToggle(task.id, "prev"); }}
              disabled={!prevColumn}
              className={cn(
                "p-0.5 rounded transition-colors",
                prevColumn
                  ? "text-text-muted/50 hover:text-white hover:bg-white/10"
                  : "text-text-muted/10 cursor-not-allowed"
              )}
              title={prevColumn ? `Move to ${prevColumn}` : "Start of board"}
              aria-label="Move left"
            >
              <ChevronLeft size={10} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onQuickToggle(task.id, "next"); }}
              disabled={!nextColumn}
              className={cn(
                "p-0.5 rounded transition-colors",
                nextColumn
                  ? "text-text-muted/50 hover:text-white hover:bg-white/10"
                  : "text-text-muted/10 cursor-not-allowed"
              )}
              title={nextColumn ? `Move to ${nextColumn}` : "End of board"}
              aria-label="Move right"
            >
              <ChevronRight size={10} />
            </button>
          </div>
        </div>

        {/* ── Title (inline editable) ── */}
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => saveEdit()}
              className="glass-input w-full h-5 px-1.5 rounded text-[12px] font-medium text-text-primary outline-none"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => { e.stopPropagation(); saveEdit(); }}
              disabled={saving}
              className="text-emerald-400 hover:text-emerald-300 p-0.5 rounded shrink-0"
              aria-label="Save"
            >
              <Check size={10} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); cancelEdit(e); }}
              className="text-text-muted hover:text-rose-400 p-0.5 rounded shrink-0"
              aria-label="Cancel"
            >
              <X size={10} />
            </button>
          </div>
        ) : (
          <p
            onClick={startEdit}
            className="text-[12px] font-medium text-text-primary leading-snug cursor-text hover:text-emerald-300/80 transition-colors line-clamp-2"
            title="Click to edit"
          >
            {task.title}
          </p>
        )}

        {/* ── Description ── */}
        {!editing && description && (
          <p className="mt-1 text-[10px] text-text-muted/80 leading-snug line-clamp-2">
            {description}
          </p>
        )}

        {/* ── Footer: due date + priority ── */}
        {(dueLabel || task.priority !== "normal") && (
          <div className="flex items-center gap-2 mt-1.5 text-[9px]">
            {dueLabel && (
              <span
                className={cn(
                  "flex items-center gap-0.5",
                  dueOverdue && "text-rose-400 font-medium",
                  dueToday && !dueOverdue && "text-amber-400 font-medium",
                  !dueOverdue && !dueToday && "text-text-muted/60"
                )}
              >
                <Calendar size={8} className={cn(dueOverdue && "animate-pulse")} />
                {dueLabel}
                {dueOverdue && <span className="text-[8px]">!</span>}
              </span>
            )}
            {task.priority !== "normal" && (
              <span className={cn("flex items-center gap-0.5 ml-auto", PRIORITY_COLORS[task.priority])}>
                <AlertCircle size={8} />
                {task.priority}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
