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
import { arrayMove } from "@dnd-kit/sortable";
import { KanbanColumn, type ColumnDef } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import type { KanbanTask, Project } from "@/types/jarvis";

export const COLUMNS: ColumnDef[] = [
  { id: "backlog", label: "Backlog", accent: "bg-slate-400" },
  { id: "todo", label: "Todo", accent: "bg-blue-400" },
  { id: "in-progress", label: "In Progress", accent: "bg-amber-400" },
  { id: "review", label: "Review", accent: "bg-purple-400" },
  { id: "done", label: "Done", accent: "bg-emerald-400" },
  { id: "ab-test", label: "AB Test", accent: "bg-rose-400" },
];

interface Props {
  tasks: KanbanTask[];
  projects: Project[];
  onAddTask: (status: string) => void;
  onEditTask: (task: KanbanTask) => void;
  onTasksReorder: (tasks: KanbanTask[]) => void;
}

export function KanbanBoard({ tasks, projects, onAddTask, onEditTask, onTasksReorder }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // Ref to track pending column changes during dragOver (avoid multiple persists)
  const pendingChanges = useRef<Map<string, string>>(new Map());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // Group tasks by column
  const columnTasks = useMemo(() => {
    const map: Record<string, KanbanTask[]> = {};
    for (const col of COLUMNS) {
      // Apply any pending visual-only status changes from dragOver
      const colTasks = tasks
        .filter((t) => {
          const pending = pendingChanges.current.get(t.id);
          return (pending ?? t.kanbanStatus) === col.id;
        })
        .map((t) => ({
          ...t,
          kanbanStatus: pendingChanges.current.get(t.id) ?? t.kanbanStatus,
        }));
      map[col.id] = colTasks;
    }
    return map;
  }, [tasks]);

  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeId) ?? null,
    [tasks, activeId]
  );
  const activeProject = activeTask
    ? projects.find((p) => p.id === activeTask.projectId)
    : undefined;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeTaskId = active.id as string;
    const activeStatus = tasks.find((t) => t.id === activeTaskId)?.kanbanStatus;
    if (!activeStatus) return;

    // Determine target container from the droppable over
    const overId = over.id as string;
    const overIsColumn = COLUMNS.some((c) => c.id === overId);

    let targetColumn: string | null = null;
    if (overIsColumn) {
      targetColumn = overId;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) targetColumn = overTask.kanbanStatus;
    }

    if (targetColumn && targetColumn !== (pendingChanges.current.get(activeTaskId) ?? activeStatus)) {
      pendingChanges.current.set(activeTaskId, targetColumn);
      // Force re-render by creating a new tasks array (visual only)
      onTasksReorder([...tasks]);
    }
  }, [tasks, onTasksReorder]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      pendingChanges.current.clear();

      if (!over || active.id === over.id) return;

      const activeTask = tasks.find((t) => t.id === active.id);
      if (!activeTask) return;

      const overId = over.id as string;
      const overIsColumn = COLUMNS.some((c) => c.id === overId);
      const overTask = overIsColumn ? null : tasks.find((t) => t.id === overId);

      let targetStatus: string;
      if (overTask) {
        targetStatus = overTask.kanbanStatus;
      } else if (overIsColumn) {
        targetStatus = overId;
      } else {
        return; // nowhere to drop
      }

      // Get current tasks in the target column for ordering
      const targetTasks = tasks
        .filter((t) => t.kanbanStatus === targetStatus && t.id !== active.id)
        .sort((a, b) => a.kanbanOrder - b.kanbanOrder);

      // Place the active task at the drop position
      let insertIndex = targetTasks.length; // default to end
      if (overTask) {
        insertIndex = targetTasks.findIndex((t) => t.id === overTask.id);
        if (insertIndex < 0) insertIndex = targetTasks.length;
      }

      targetTasks.splice(insertIndex, 0, { ...activeTask, kanbanStatus: targetStatus });

      // Rebuild full task list with updated order
      const updatedAll = tasks.map((t) => {
        if (t.id === activeTask.id) {
          return { ...t, kanbanStatus: targetStatus, kanbanOrder: insertIndex };
        }
        // Reorder tasks in the affected column
        const inCol = targetTasks.find((nt) => nt.id === t.id);
        if (inCol) {
          const idx = targetTasks.indexOf(inCol);
          return { ...t, kanbanOrder: idx };
        }
        return t;
      });

      // If status actually changed, persist
      if (activeTask.kanbanStatus !== targetStatus) {
        onTasksReorder(updatedAll);
        // Batch persist: status + order
        try {
          await Promise.all([
            fetch(`/api/projects/tasks/${activeTask.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ kanbanStatus: targetStatus }),
            }),
            // Re-order all tasks in the target column
            ...targetTasks.map((t) =>
              fetch(`/api/projects/tasks/${t.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ kanbanOrder: targetTasks.indexOf(t) }),
              })
            ),
          ]);
        } catch {
          // Silently fail — refetch will fix
        }
      } else {
        // Same column reorder only
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
          // Silent
        }
      }
    },
    [tasks, onTasksReorder]
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            tasks={columnTasks[col.id] ?? []}
            projects={projects}
            onAddTask={onAddTask}
            onEditTask={onEditTask}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask && (
          <div className="rotate-[3deg] scale-105 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)]">
            <KanbanCard task={activeTask} project={activeProject} onClick={() => {}} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
