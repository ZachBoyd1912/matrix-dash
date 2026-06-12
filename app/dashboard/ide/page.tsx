"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { Save } from "lucide-react";
import { FileTree } from "@/components/ide/file-tree";
import { EditorTabs } from "@/components/ide/editor-tabs";
import { MonacoEditor } from "@/components/ide/monaco-editor";
import { EmptyState } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { FileMeta, FileRecord } from "@/types/file";
import { languageFromPath } from "@/lib/utils/language";
import { toast, confirm } from "@/lib/stores/use-feedback";

interface OpenFile {
  meta: FileMeta;
  content: string;
  originalContent: string;
}

export default function IdePage() {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [openFiles, setOpenFiles] = useState<Record<string, OpenFile>>({});
  const [openOrder, setOpenOrder] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshList = useCallback(async () => {
    const res = await fetch("/api/files");
    const data = (await res.json()) as FileMeta[];
    setFiles(data);
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const openFile = useCallback(
    async (id: string) => {
      setActiveId(id);
      if (openFiles[id]) return;
      const res = await fetch(`/api/files/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as FileRecord;
      setOpenFiles((prev) => ({
        ...prev,
        [id]: { meta: data, content: data.content, originalContent: data.content },
      }));
      setOpenOrder((prev) => (prev.includes(id) ? prev : [...prev, id]));
    },
    [openFiles]
  );

  const closeFile = useCallback(
    (id: string) => {
      setOpenFiles((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setOpenOrder((prev) => prev.filter((x) => x !== id));
      if (activeId === id) {
        const remaining = openOrder.filter((x) => x !== id);
        setActiveId(remaining[remaining.length - 1] ?? null);
      }
    },
    [activeId, openOrder]
  );

  const saveActive = useCallback(async () => {
    if (!activeId) return;
    const file = openFiles[activeId];
    if (!file) return;
    await fetch(`/api/files/${file.meta.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: file.content }),
    });
    setOpenFiles((prev) => ({
      ...prev,
      [activeId]: { ...file, originalContent: file.content },
    }));
    refreshList();
  }, [activeId, openFiles, refreshList]);

  // Cmd/Ctrl+S to save.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        saveActive();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveActive]);

  const onChange = (next: string) => {
    if (!activeId) return;
    setOpenFiles((prev) => {
      const current = prev[activeId];
      if (!current) return prev;
      return { ...prev, [activeId]: { ...current, content: next } };
    });
    // Debounced autosave.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveActive, 1200);
  };

  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");

  const create = () => {
    setNewFilePath("");
    setNewFileOpen(true);
  };

  const submitCreate = async () => {
    const path = newFilePath.trim();
    if (!path) return;
    const name = path.split("/").pop() || path;
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        path,
        content: "",
        language: languageFromPath(path),
      }),
    });
    const data = await res.json();
    setNewFileOpen(false);
    toast.success(`Created ${name}`);
    await refreshList();
    if (data.id) openFile(data.id);
  };

  const remove = async (id: string) => {
    const file = files.find((f) => f.id === id);
    const ok = await confirm({
      title: `Delete ${file?.name ?? "file"}?`,
      description: "The file will be removed from the workspace permanently.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/files/${id}`, { method: "DELETE" });
    toast.success("File deleted");
    closeFile(id);
    refreshList();
  };

  const active = activeId ? openFiles[activeId] : null;
  const tabFiles: FileMeta[] = openOrder
    .map((id) => openFiles[id]?.meta)
    .filter((f): f is FileMeta => !!f);
  const dirty = new Set<string>();
  for (const [id, f] of Object.entries(openFiles)) {
    if (f.content !== f.originalContent) dirty.add(id);
  }

  return (
    <div className="page-h grid grid-cols-[180px_1fr] md:grid-cols-[240px_1fr]">
      <aside className="border-r border-white/5 bg-white/[0.01]">
        <FileTree
          files={files}
          activeId={activeId}
          onOpen={openFile}
          onCreate={create}
          onDelete={remove}
        />
      </aside>
      <section className="flex flex-col min-w-0">
        {tabFiles.length > 0 && (
          <EditorTabs
            files={tabFiles}
            activeId={activeId}
            dirty={dirty}
            onSelect={setActiveId}
            onClose={closeFile}
          />
        )}
        <div className="flex-1 min-h-0 relative">
          {active ? (
            <>
              <MonacoEditor
                key={active.meta.id}
                value={active.content}
                language={active.meta.language || "plaintext"}
                onChange={onChange}
              />
              {dirty.has(active.meta.id) && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={saveActive}
                  className="absolute top-3 right-4 z-10"
                >
                  <Save size={13} /> Save
                </Button>
              )}
            </>
          ) : (
            <div className="h-full grid place-items-center p-8">
              <EmptyState
                title="No file open"
                description="Create a file or pick one from the tree to start editing."
                action={<Button variant="primary" size="sm" onClick={create}>+ New file</Button>}
              />
            </div>
          )}
        </div>
        <div className="border-t border-white/5 px-4 h-7 flex items-center justify-between text-[10px] text-text-muted">
          <div className="flex items-center gap-3">
            <span>{active?.meta.language ?? "plaintext"}</span>
            {active && <span>{active.meta.path}</span>}
          </div>
          <div className="flex items-center gap-3">
            <span>UTF-8</span>
            {active && dirty.has(active.meta.id) && (
              <span className="text-emerald-400">● unsaved</span>
            )}
          </div>
        </div>
      </section>

      <Dialog
        open={newFileOpen}
        onClose={() => setNewFileOpen(false)}
        title="New file"
        description="Folders are created automatically from the path."
      >
        <div className="space-y-3">
          <Input
            autoFocus
            value={newFilePath}
            onChange={(e) => setNewFilePath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCreate();
            }}
            placeholder="src/utils.ts"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewFileOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitCreate} disabled={!newFilePath.trim()}>
              Create
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
