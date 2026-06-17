"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";
import { COLUMNS } from "./kanban-board";
import type { KanbanTask, Project } from "@/types/jarvis";

interface Props {
  open: boolean;
  onClose: () => void;
  task: KanbanTask | null; // null = creating new
  defaultStatus?: string;
  projects: Project[];
  onSave: (data: {
    title: string;
    notes: string;
    priority: string;
    dueAt: string | null;
    projectId: string | null;
    kanbanStatus: string;
  }) => void;
}

export function EditTaskDialog({ open, onClose, task, defaultStatus, projects, onSave }: Props) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState("normal");
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
      setDueAt(task.dueAt ? task.dueAt.slice(0, 16) : "");
      setProjectId(task.projectId ?? "");
      setKanbanStatus(task.kanbanStatus);
    } else {
      setTitle("");
      setNotes("");
      setPriority("normal");
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
      <div className="relative glass-strong rounded-2xl w-full max-w-lg p-6 animate-[fadeIn_180ms_ease-out]">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-white/5"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <h2 className="text-lg font-semibold text-text-primary mb-1">
          {task ? "Edit Task" : "New Task"}
        </h2>
        <p className="text-xs text-text-secondary mb-4">
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
              <label className="block text-[10px] uppercase text-text-muted mb-1">Priority</label>
              <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </div>
            <div>
              <label className="block text-[10px] uppercase text-text-muted mb-1">Due Date</label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="glass-input w-full h-9 px-2 rounded-md text-sm text-text-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase text-text-muted mb-1">Project</label>
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
              <label className="block text-[10px] uppercase text-text-muted mb-1">Column</label>
              <Select value={kanbanStatus} onChange={(e) => setKanbanStatus(e.target.value)}>
                {COLUMNS.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!title.trim()}>
              {task ? "Save Changes" : "Add Task"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
