"use client";

import { useEffect, useState, useCallback } from "react";
import { FolderKanban, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { useGsapEntrance } from "@/lib/hooks/use-gsap-entrance";
import { useCrossTabSync } from "@/lib/hooks/use-cross-tab-sync";
import { ProjectCard } from "@/components/projects/project-card";
import { KanbanBoard } from "@/components/projects/kanban-board";
import { EditTaskDialog } from "@/components/projects/edit-task-dialog";
import type { Project, KanbanTask } from "@/types/jarvis";

const COLUMN_IDS = ["backlog", "todo", "in-progress", "review", "done", "ab-test"];

export default function ProjectsPage() {
  const ref = useGsapEntrance();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<KanbanTask | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<string>("backlog");

  const fetchProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    setProjects(await res.json());
  }, []);

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/projects/tasks");
    const data: KanbanTask[] = await res.json();
    setTasks(data);
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchProjects(), fetchTasks()]);
    setLoading(false);
  }, [fetchProjects, fetchTasks]);

  // Cross-tab sync
  const notifyTabs = useCrossTabSync(refreshAll);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  // ── Handlers ──────────────────────────────────────────────────────

  const handleViewTasks = useCallback((projectId: string) => {
    setFilterProjectId(projectId);
  }, []);

  const clearFilter = useCallback(() => {
    setFilterProjectId(null);
  }, []);

  const handleAddTask = useCallback((status: string) => {
    setEditingTask(null);
    setDefaultStatus(status);
    setDialogOpen(true);
  }, []);

  const handleEditTask = useCallback((task: KanbanTask) => {
    setEditingTask(task);
    setDefaultStatus(task.kanbanStatus);
    setDialogOpen(true);
  }, []);

  const handleSaveTask = useCallback(
    async (data: {
      title: string; notes: string; priority: string;
      dueAt: string | null; projectId: string | null; kanbanStatus: string;
    }) => {
      if (editingTask) {
        await fetch(`/api/projects/tasks/${editingTask.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        });
      } else {
        await fetch("/api/projects/tasks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        });
      }
      setDialogOpen(false);
      setEditingTask(null);
      await fetchTasks();
      notifyTabs();
    },
    [editingTask, fetchTasks, notifyTabs]
  );

  // Inline title edit — save via PATCH, re-fetch, notify tabs
  const handleInlineEdit = useCallback(
    async (id: string, title: string) => {
      await fetch(`/api/projects/tasks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      await fetchTasks();
      notifyTabs();
    },
    [fetchTasks, notifyTabs]
  );

  // Quick toggle ◀ ▶ — shift task to adjacent column
  const handleQuickToggle = useCallback(
    async (id: string, direction: "prev" | "next") => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return;
      const curIdx = COLUMN_IDS.indexOf(task.kanbanStatus);
      const newIdx = direction === "next" ? curIdx + 1 : curIdx - 1;
      if (newIdx < 0 || newIdx >= COLUMN_IDS.length) return;
      const newStatus = COLUMN_IDS[newIdx];

      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, kanbanStatus: newStatus } : t))
      );

      await fetch(`/api/projects/tasks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kanbanStatus: newStatus }),
      });
      await fetchTasks();
      notifyTabs();
    },
    [tasks, fetchTasks, notifyTabs]
  );

  const handleTasksReorder = useCallback((updated: KanbanTask[]) => {
    setTasks(updated);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────

  const filteredTasks = filterProjectId
    ? tasks.filter((t) => t.projectId === filterProjectId)
    : tasks;

  const activeFilterProject = filterProjectId
    ? projects?.find((p) => p.id === filterProjectId)
    : null;

  // ── Loading ───────────────────────────────────────────────────────

  if (loading && !projects) {
    return (
      <div ref={ref} className="px-4 md:px-8 py-10 max-w-6xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <RefreshCw size={20} className="text-text-muted animate-spin" />
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div ref={ref} className="px-4 md:px-8 py-10 max-w-6xl mx-auto space-y-6">
      {/* Orbs */}
      <div className="relative">
        <div className="orb -top-16 left-10 h-52 w-52 bg-emerald-500/20" />
        <div className="orb -top-10 right-16 h-44 w-44 bg-purple-500/15" style={{ animationDelay: "-6s" }} />
        <div className="relative flex items-center justify-between">
          <div>
            <span className="eyebrow">
              <FolderKanban size={11} /> Project Planning
            </span>
            <h1 className="display text-gradient text-4xl md:text-5xl font-extrabold mt-3">
              Projects
            </h1>
            <p className="text-text-secondary text-sm mt-2">
              Portfolio catalog + kanban task board across all your projects.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={refreshAll} title="Refresh">
            <RefreshCw size={13} />
          </Button>
        </div>
      </div>

      {/* ── Zone 1: Project Portfolio Catalog ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
            Portfolio
            {projects && (
              <span className="text-text-muted font-normal lowercase ml-1">
                ({projects.length} projects)
              </span>
            )}
          </h2>
        </div>

        {projects && projects.length > 0 ? (
          <div className="space-y-2">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onViewTasks={handleViewTasks} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FolderKanban size={16} />}
            title="No projects"
            description="Projects will appear here once the database is seeded."
          />
        )}
      </section>

      <hr className="border-white/5" />

      {/* ── Zone 2: Kanban Board ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Tasks
            </h2>
            {activeFilterProject && (
              <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[10px] font-medium bg-emerald-400/10 border border-emerald-400/20 text-emerald-400">
                <FolderKanban size={10} />
                {activeFilterProject.name}
                <button onClick={clearFilter} className="hover:text-emerald-300" aria-label="Clear filter">
                  <X size={11} />
                </button>
              </span>
            )}
          </div>
          <span className="text-[11px] text-text-muted tabular-nums">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
          </span>
        </div>

        {tasks.length === 0 && !loading ? (
          <EmptyState
            icon={<FolderKanban size={16} />}
            title="No tasks yet"
            description='Click the "+" on any column to create your first task.'
          />
        ) : filteredTasks.length === 0 && filterProjectId ? (
          <EmptyState
            icon={<FolderKanban size={16} />}
            title={`No tasks for ${activeFilterProject?.name ?? "this project"}`}
            description='Click the "+" on any column to add a task.'
            action={
              <Button variant="primary" size="sm" onClick={() => handleAddTask("backlog")}>
                Add first task
              </Button>
            }
          />
        ) : (
          <KanbanBoard
            tasks={filteredTasks}
            projects={projects ?? []}
            onAddTask={handleAddTask}
            onEditTask={handleEditTask}
            onTasksReorder={handleTasksReorder}
            onInlineEdit={handleInlineEdit}
            onQuickToggle={handleQuickToggle}
            onNotifyTabs={notifyTabs}
          />
        )}
      </section>

      {/* Task edit/create dialog */}
      <EditTaskDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingTask(null);
        }}
        task={editingTask}
        defaultStatus={defaultStatus}
        projects={projects ?? []}
        onSave={handleSaveTask}
      />
    </div>
  );
}
