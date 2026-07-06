"use client";

import { useState, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { COLUMNS } from "./kanban-board";
import type { KanbanTask, Project } from "@/types/jarvis";

interface Props {
  open: boolean;
  onClose: () => void;
  task: KanbanTask | null; // null = creating new
  defaultStatus?: string;
  projects: Project[];
  onDelete?: (id: string) => void;
  onSave: (data: {
    title: string;
    notes: string;
    priority: string;
    kind: string;
    dueAt: string | null;
    projectId: string | null;
    kanbanStatus: string;
  }) => void;
}

export function EditTaskDialog({
  open,
  onClose,
  task,
  defaultStatus,
  projects,
  onDelete,
  onSave,
}: Props) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState("normal");
  const [kind, setKind] = useState("task");
  const [dueAt, setDueAt] = useState("");
  const [projectId, setProjectId] = useState("");
  const [kanbanStatus, setKanbanStatus] = useState(defaultStatus ?? "backlog");

  // Reset form when dialog opens
  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setNotes(task.notes ?? "");
      setPriority(task.priority);
      setKind(task.kind ?? "task");
      setDueAt(task.dueAt ? task.dueAt.slice(0, 16) : "");
      setProjectId(task.projectId ?? "");
      setKanbanStatus(task.kanbanStatus);
    } else {
      setTitle("");
      setNotes("");
      setPriority("normal");
      setKind("task");
      setDueAt("");
      setProjectId("");
      setKanbanStatus(defaultStatus ?? "backlog");
    }
  }, [open, task, defaultStatus]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      notes,
      priority,
      kind,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      projectId: projectId || null,
      kanbanStatus,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="glass-strong relative w-full max-w-lg animate-[fadeIn_180ms_ease-out] rounded-2xl p-6">
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary absolute top-3 right-3 rounded-md p-1 hover:bg-white/5"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <h2 className="text-text-primary mb-1 text-lg font-semibold">
          {task ? "Edit Task" : "New Task"}
        </h2>
        <p className="text-text-secondary mb-4 text-xs">
          {task ? "Update this task's details." : "Add a new task to the board."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            autoFocus
          />
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes or description…"
            rows={3}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-text-muted mb-1 block text-[10px] uppercase">Type</label>
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="task">Task</option>
                <option value="bug">Bug</option>
                <option value="error">Error</option>
                <option value="feature">Feature</option>
              </Select>
            </div>
            <div>
              <label className="text-text-muted mb-1 block text-[10px] uppercase">Priority</label>
              <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-text-muted mb-1 block text-[10px] uppercase">Due Date</label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="glass-input text-text-primary h-9 w-full rounded-md px-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-text-muted mb-1 block text-[10px] uppercase">Project</label>
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">— No project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-text-muted mb-1 block text-[10px] uppercase">Column</label>
              <Select value={kanbanStatus} onChange={(e) => setKanbanStatus(e.target.value)}>
                {COLUMNS.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {task && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(task.id)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-rose-400 transition-colors hover:bg-rose-400/10 hover:text-rose-300"
              >
                <Trash2 size={13} /> Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={!title.trim()}>
                {task ? "Save Changes" : "Add Task"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
