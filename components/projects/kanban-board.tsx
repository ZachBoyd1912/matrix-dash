"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { KanbanColumn, type ColumnDef } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import type { KanbanTask, Project } from "@/types/jarvis";

// ── 6-Column Layout ────────────────────────────────────────────────
export const COLUMNS: ColumnDef[] = [
  { id: "backlog", label: "Backlog", accent: "bg-slate-400" },
  { id: "planned", label: "Planned", accent: "bg-blue-400" },
  { id: "in-progress", label: "In Progress", accent: "bg-amber-400" },
  { id: "developed", label: "Developed", accent: "bg-purple-400" },
  { id: "tested", label: "Tested", accent: "bg-cyan-400" },
  { id: "completed", label: "Completed", accent: "bg-emerald-400" },
];

const COLUMN_IDS = COLUMNS.map((c) => c.id);

interface Props {
  tasks: KanbanTask[];
  projects: Project[];
  onAddTask: (status: string) => void;
  onEditTask: (task: KanbanTask) => void;
  onTasksReorder: (tasks: KanbanTask[]) => void;
  onInlineEdit: (id: string, title: string) => Promise<void>;
  onQuickToggle: (id: string, direction: "prev" | "next") => void;
  onNotifyTabs?: () => void;
}

export function KanbanBoard({
  tasks,
  projects,
  onAddTask,
  onEditTask,
  onTasksReorder,
  onInlineEdit,
  onQuickToggle,
  onNotifyTabs,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const pendingChanges = useRef<Map<string, string>>(new Map());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Group tasks by column
  const columnTasks = useMemo(() => {
    const map: Record<string, KanbanTask[]> = {};
    for (const col of COLUMNS) {
      map[col.id] = tasks
        .filter((t) => (pendingChanges.current.get(t.id) ?? t.kanbanStatus) === col.id)
        .sort((a, b) => a.kanbanOrder - b.kanbanOrder)
        .map((t) => ({ ...t, kanbanStatus: pendingChanges.current.get(t.id) ?? t.kanbanStatus }));
    }
    return map;
  }, [tasks]);

  const activeTask = useMemo(() => tasks.find((t) => t.id === activeId) ?? null, [tasks, activeId]);
  const activeProject = activeTask
    ? projects.find((p) => p.id === activeTask.projectId)
    : undefined;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeTaskId = active.id as string;
      const activeStatus = tasks.find((t) => t.id === activeTaskId)?.kanbanStatus;
      if (!activeStatus) return;

      const overId = over.id as string;
      const overIsColumn = COLUMN_IDS.includes(overId);
      let targetCol: string | null = null;
      if (overIsColumn) {
        targetCol = overId;
      } else {
        const overTask = tasks.find((t) => t.id === overId);
        if (overTask) targetCol = overTask.kanbanStatus;
      }

      if (targetCol && targetCol !== (pendingChanges.current.get(activeTaskId) ?? activeStatus)) {
        pendingChanges.current.set(activeTaskId, targetCol);
        onTasksReorder([...tasks]);
      }
    },
    [tasks, onTasksReorder]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      pendingChanges.current.clear();
      if (!over || active.id === over.id) return;

      const activeTask = tasks.find((t) => t.id === active.id);
      if (!activeTask) return;

      const overId = over.id as string;
      const overIsColumn = COLUMN_IDS.includes(overId);
      const overTask = overIsColumn ? null : tasks.find((t) => t.id === overId);

      let targetStatus: string;
      if (overTask) targetStatus = overTask.kanbanStatus;
      else if (overIsColumn) targetStatus = overId;
      else return;

      const targetTasks = tasks
        .filter((t) => t.kanbanStatus === targetStatus && t.id !== active.id)
        .sort((a, b) => a.kanbanOrder - b.kanbanOrder);

      let insertIndex = targetTasks.length;
      if (overTask) {
        insertIndex = targetTasks.findIndex((t) => t.id === overTask.id);
        if (insertIndex < 0) insertIndex = targetTasks.length;
      }

      targetTasks.splice(insertIndex, 0, { ...activeTask, kanbanStatus: targetStatus });

      const updatedAll = tasks.map((t) => {
        if (t.id === activeTask.id)
          return { ...t, kanbanStatus: targetStatus, kanbanOrder: insertIndex };
        const inCol = targetTasks.find((nt) => nt.id === t.id);
        if (inCol) return { ...t, kanbanOrder: targetTasks.indexOf(inCol) };
        return t;
      });

      if (activeTask.kanbanStatus !== targetStatus) {
        onTasksReorder(updatedAll);
        try {
          await Promise.all([
            fetch(`/api/projects/tasks/${activeTask.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ kanbanStatus: targetStatus }),
            }),
            ...targetTasks.map((t) =>
              fetch(`/api/projects/tasks/${t.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ kanbanOrder: targetTasks.indexOf(t) }),
              })
            ),
          ]);
        } catch {
          /* refetch fixes */
        }
        onNotifyTabs?.();
      } else {
        onTasksReorder(updatedAll);
        try {
          await Promise.all(
            updatedAll
              .filter((t) => t.kanbanStatus === targetStatus)
              .map((t) =>
                fetch(`/api/projects/tasks/${t.id}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ kanbanOrder: t.kanbanOrder }),
                })
              )
          );
        } catch {
          /* silent */
        }
        onNotifyTabs?.();
      }
    },
    [tasks, onTasksReorder, onNotifyTabs]
  );

  const handleQuickToggle = useCallback(
    (id: string, direction: "prev" | "next") => {
      onQuickToggle(id, direction);
    },
    [onQuickToggle]
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* ── Table Container ── */}
      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015]">
        {/* ── Title Bar ── */}
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <h3 className="text-text-primary text-center text-sm font-semibold tracking-wide">
            Requirement / Task / Incident Progress
          </h3>
        </div>

        {/* ── Column Headers ── */}
        <div className="grid grid-cols-6 border-b border-white/[0.06]">
          {COLUMNS.map((col, i) => (
            <div
              key={col.id}
              className={`px-3 py-2.5 text-center ${
                i < COLUMNS.length - 1 ? "border-r border-white/[0.06]" : ""
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span className={`h-2 w-2 rounded-full ${col.accent}`} />
                <span className="text-text-secondary text-[11px] font-semibold tracking-widest uppercase">
                  {col.label}
                </span>
                <span className="text-text-muted rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                  {(columnTasks[col.id] ?? []).length}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Grid Body ── */}
        <div className="grid min-h-[400px] grid-cols-6">
          {COLUMNS.map((col, i) => (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={columnTasks[col.id] ?? []}
              projects={projects}
              onAddTask={onAddTask}
              onEditTask={onEditTask}
              onInlineEdit={onInlineEdit}
              onQuickToggle={handleQuickToggle}
              isLast={i === COLUMNS.length - 1}
            />
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="scale-105 rotate-[2deg] shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)]">
            <KanbanCard
              task={activeTask}
              project={activeProject}
              prevColumn={null}
              nextColumn={null}
              onClick={() => {}}
              onInlineEdit={async () => {}}
              onQuickToggle={() => {}}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
