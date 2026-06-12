"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen, FolderPlus, Plus, Save, X, Clock, HardDrive } from "lucide-react";
import { FileTree } from "@/components/ide/file-tree";
import { EditorTabs } from "@/components/ide/editor-tabs";
import { MonacoEditor } from "@/components/ide/monaco-editor";
import { EmptyState } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast, confirm } from "@/lib/stores/use-feedback";
import type { FileReadResult, TreeEntry, WorkspaceRecord } from "@/types/workspace";

interface OpenFile {
  path: string;
  name: string;
  language: string;
  content: string;
  originalContent: string;
  truncated: boolean;
}

interface Workspace {
  root: string;
  name: string;
}

function basename(p: string): string {
  return p.split("/").filter(Boolean).pop() ?? p;
}
function parentOf(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx > 0 ? p.slice(0, idx) : p;
}

export default function IdePage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [recents, setRecents] = useState<WorkspaceRecord[]>([]);
  const [pathInput, setPathInput] = useState("");
  const [opening, setOpening] = useState(false);
  const [booted, setBooted] = useState(false);

  const [openFiles, setOpenFiles] = useState<Record<string, OpenFile>>({});
  const [openOrder, setOpenOrder] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ line: number; col: number }>({ line: 1, col: 1 });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Workspace lifecycle ───────────────────────────────
  const loadRecents = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace");
      if (res.ok) setRecents((await res.json()) as WorkspaceRecord[]);
    } catch {
      /* recents are non-critical */
    }
  }, []);

  const loadTree = useCallback(async (root: string) => {
    try {
      const res = await fetch(`/api/workspace/tree?root=${encodeURIComponent(root)}`);
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Could not read folder" }));
        toast.error("Failed to read folder", error);
        return false;
      }
      const data = (await res.json()) as { root: string; name: string; tree: TreeEntry[] };
      setTree(data.tree);
      return true;
    } catch (err) {
      toast.error("Failed to read folder", err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  const openWorkspace = useCallback(
    async (root: string) => {
      const trimmed = root.trim();
      if (!trimmed) return;
      setOpening(true);
      try {
        const res = await fetch("/api/workspace", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: trimmed }),
        });
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: "Could not open folder" }));
          toast.error("Could not open folder", error);
          return;
        }
        const rec = (await res.json()) as WorkspaceRecord;
        const ok = await loadTree(rec.path);
        if (!ok) return;
        setWorkspace({ root: rec.path, name: rec.name });
        setPathInput("");
        await fetch("/api/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ activeWorkspace: rec.path }),
        }).catch(() => {});
        loadRecents();
      } finally {
        setOpening(false);
      }
    },
    [loadTree, loadRecents]
  );

  // Boot: restore last workspace + load recents.
  useEffect(() => {
    (async () => {
      await loadRecents();
      try {
        const res = await fetch("/api/settings");
        const s = (await res.json()) as Record<string, string>;
        const active = s.activeWorkspace;
        if (active) {
          const ok = await loadTree(active);
          if (ok) setWorkspace({ root: active, name: basename(active) });
        }
      } catch {
        /* ignore */
      } finally {
        setBooted(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeWorkspace = useCallback(async () => {
    setWorkspace(null);
    setTree([]);
    setOpenFiles({});
    setOpenOrder([]);
    setActivePath(null);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activeWorkspace: "" }),
    }).catch(() => {});
    loadRecents();
  }, [loadRecents]);

  const removeRecent = useCallback(async (id: string) => {
    await fetch(`/api/workspace/${id}`, { method: "DELETE" }).catch(() => {});
    setRecents((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // ─── File lifecycle ────────────────────────────────────
  const openFile = useCallback(
    async (path: string) => {
      setActivePath(path);
      if (openFiles[path]) return;
      try {
        const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: "Could not open file" }));
          toast.error("Could not open file", error);
          return;
        }
        const data = (await res.json()) as FileReadResult;
        setOpenFiles((prev) => ({
          ...prev,
          [path]: {
            path,
            name: basename(path),
            language: data.language,
            content: data.content,
            originalContent: data.content,
            truncated: data.truncated,
          },
        }));
        setOpenOrder((prev) => (prev.includes(path) ? prev : [...prev, path]));
        if (data.truncated) toast.info("Large file truncated to 500 KB for editing");
      } catch (err) {
        toast.error("Could not open file", err instanceof Error ? err.message : String(err));
      }
    },
    [openFiles]
  );

  const closeFile = useCallback(
    (path: string) => {
      setOpenFiles((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
      setOpenOrder((prev) => prev.filter((x) => x !== path));
      setActivePath((cur) => {
        if (cur !== path) return cur;
        const remaining = openOrder.filter((x) => x !== path);
        return remaining[remaining.length - 1] ?? null;
      });
    },
    [openOrder]
  );

  const saveActive = useCallback(async () => {
    if (!activePath) return;
    const file = openFiles[activePath];
    if (!file || file.content === file.originalContent) return;
    try {
      const res = await fetch("/api/workspace/file", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: file.path, content: file.content }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Write failed" }));
        toast.error("Could not save", error);
        return;
      }
      setOpenFiles((prev) => ({
        ...prev,
        [file.path]: { ...prev[file.path], originalContent: file.content },
      }));
      toast.success("Saved", file.name);
    } catch (err) {
      toast.error("Could not save", err instanceof Error ? err.message : String(err));
    }
  }, [activePath, openFiles]);

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
    if (!activePath) return;
    setOpenFiles((prev) => {
      const current = prev[activePath];
      if (!current) return prev;
      return { ...prev, [activePath]: { ...current, content: next } };
    });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveActive, 1500);
  };

  // ─── Tree actions ──────────────────────────────────────
  const [dialog, setDialog] = useState<{ mode: "file" | "folder"; value: string } | null>(null);

  const promptNewFile = (dir: string) => setDialog({ mode: "file", value: `${dir}/` });
  const promptNewFolder = (dir: string) => setDialog({ mode: "folder", value: `${dir}/` });

  const submitDialog = async () => {
    if (!dialog) return;
    const target = dialog.value.trim();
    if (!target || target.endsWith("/")) {
      toast.error("Enter a name");
      return;
    }
    try {
      if (dialog.mode === "file") {
        const res = await fetch("/api/workspace/file", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: target, create: true }),
        });
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: "Could not create file" }));
          toast.error("Could not create file", error);
          return;
        }
        setDialog(null);
        if (workspace) await loadTree(workspace.root);
        toast.success(`Created ${basename(target)}`);
        openFile(target);
      } else {
        const res = await fetch("/api/workspace/mkdir", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: target }),
        });
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: "Could not create folder" }));
          toast.error("Could not create folder", error);
          return;
        }
        setDialog(null);
        if (workspace) await loadTree(workspace.root);
        toast.success(`Created ${basename(target)}/`);
      }
    } catch (err) {
      toast.error("Action failed", err instanceof Error ? err.message : String(err));
    }
  };

  const renameEntry = async (entry: TreeEntry, newName: string) => {
    const to = `${parentOf(entry.path)}/${newName}`;
    try {
      const res = await fetch("/api/workspace/rename", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from: entry.path, to }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Rename failed" }));
        toast.error("Could not rename", error);
        return;
      }
      // Re-key any open tab that lived under the old path.
      setOpenFiles((prev) => {
        const next: Record<string, OpenFile> = {};
        for (const [key, val] of Object.entries(prev)) {
          if (key === entry.path) next[to] = { ...val, path: to, name: basename(to) };
          else if (key.startsWith(entry.path + "/")) {
            const moved = to + key.slice(entry.path.length);
            next[moved] = { ...val, path: moved, name: basename(moved) };
          } else next[key] = val;
        }
        return next;
      });
      setOpenOrder((prev) =>
        prev.map((k) =>
          k === entry.path ? to : k.startsWith(entry.path + "/") ? to + k.slice(entry.path.length) : k
        )
      );
      setActivePath((cur) =>
        cur === entry.path ? to : cur && cur.startsWith(entry.path + "/") ? to + cur.slice(entry.path.length) : cur
      );
      if (workspace) await loadTree(workspace.root);
      toast.success(`Renamed to ${newName}`);
    } catch (err) {
      toast.error("Could not rename", err instanceof Error ? err.message : String(err));
    }
  };

  const deleteEntry = async (entry: TreeEntry) => {
    const ok = await confirm({
      title: `Delete ${entry.name}?`,
      description:
        entry.type === "dir"
          ? "The folder and everything inside it will be permanently deleted from disk."
          : "This file will be permanently deleted from disk.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(entry.path)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Delete failed" }));
        toast.error("Could not delete", error);
        return;
      }
      // Close any tab under the deleted path.
      for (const key of Object.keys(openFiles)) {
        if (key === entry.path || key.startsWith(entry.path + "/")) closeFile(key);
      }
      if (workspace) await loadTree(workspace.root);
      toast.success(`Deleted ${entry.name}`);
    } catch (err) {
      toast.error("Could not delete", err instanceof Error ? err.message : String(err));
    }
  };

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      toast.success("Path copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  // ─── Render ────────────────────────────────────────────
  const active = activePath ? openFiles[activePath] : null;
  const tabFiles = openOrder
    .map((p) => openFiles[p])
    .filter((f): f is OpenFile => !!f)
    .map((f) => ({ id: f.path, name: f.name }));
  const dirty = new Set<string>();
  for (const [p, f] of Object.entries(openFiles)) {
    if (f.content !== f.originalContent) dirty.add(p);
  }

  // Empty state — workspace picker.
  if (!workspace) {
    return (
      <div className="page-h grid place-items-center p-6">
        <div className="w-full max-w-xl space-y-6">
          <div className="text-center">
            <div className="inline-grid place-items-center h-14 w-14 rounded-2xl bg-emerald-400/10 border border-emerald-400/20 mb-4">
              <FolderOpen size={24} className="text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Open a project folder</h2>
            <p className="text-text-secondary text-sm mt-1">
              Edit real files on disk — a full Monaco workspace, like VS Code inside Matrix.
            </p>
          </div>

          <div className="glass rounded-xl p-4 space-y-3">
            <label className="text-[10px] uppercase tracking-wider text-text-muted block">Folder path</label>
            <div className="flex gap-2">
              <Input
                autoFocus
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openWorkspace(pathInput);
                }}
                placeholder="/Users/you/projects/my-app"
                className="font-mono text-xs"
              />
              <Button variant="primary" onClick={() => openWorkspace(pathInput)} disabled={opening || !pathInput.trim()}>
                <FolderOpen size={14} /> {opening ? "Opening…" : "Open"}
              </Button>
            </div>
            <p className="text-[10px] text-text-muted">
              Paste an absolute path. Heavy folders (node_modules, .git, dist…) are skipped automatically.
            </p>
          </div>

          {recents.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <Clock size={11} /> Recent workspaces
              </p>
              <div className="space-y-1.5">
                {recents.map((r) => (
                  <div
                    key={r.id}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-lg glass-input cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => openWorkspace(r.path)}
                  >
                    <HardDrive size={15} className="text-text-muted shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary truncate">{r.name}</p>
                      <p className="text-[10px] text-text-muted font-mono truncate">{r.path}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecent(r.id);
                      }}
                      className="text-text-muted hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      aria-label="Remove from recents"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {booted && recents.length === 0 && (
            <p className="text-center text-[11px] text-text-muted">No recent workspaces yet.</p>
          )}
        </div>

        <NewEntryDialog dialog={dialog} setDialog={setDialog} submit={submitDialog} />
      </div>
    );
  }

  // Workspace open mode.
  return (
    <div className="page-h grid grid-cols-[200px_1fr] md:grid-cols-[260px_1fr]">
      <aside className="border-r border-white/5 bg-white/[0.01] flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <FolderOpen size={13} className="text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold text-text-primary truncate" title={workspace.root}>
              {workspace.name}
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => promptNewFile(workspace.root)}
              className="text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-white/5 transition-colors"
              aria-label="New file"
              title="New file at root"
            >
              <Plus size={13} />
            </button>
            <button
              onClick={() => promptNewFolder(workspace.root)}
              className="text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-white/5 transition-colors"
              aria-label="New folder"
              title="New folder at root"
            >
              <FolderPlus size={13} />
            </button>
            <button
              onClick={closeWorkspace}
              className="text-text-muted hover:text-rose-400 p-1 rounded-md hover:bg-white/5 transition-colors"
              aria-label="Close workspace"
              title="Close workspace"
            >
              <X size={13} />
            </button>
          </div>
        </div>
        <FileTree
          tree={tree}
          activePath={activePath}
          onOpenFile={openFile}
          onNewFile={promptNewFile}
          onNewFolder={promptNewFolder}
          onRename={renameEntry}
          onDelete={deleteEntry}
          onCopyPath={copyPath}
        />
      </aside>

      <section className="flex flex-col min-w-0">
        {tabFiles.length > 0 && (
          <EditorTabs files={tabFiles} activeId={activePath} dirty={dirty} onSelect={setActivePath} onClose={closeFile} />
        )}
        <div className="flex-1 min-h-0 relative">
          {active ? (
            <>
              <MonacoEditor
                key={active.path}
                value={active.content}
                language={active.language || "plaintext"}
                onChange={onChange}
                onSave={saveActive}
                onCursor={(line, col) => setCursor({ line, col })}
              />
              {dirty.has(active.path) && (
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
                description="Pick a file from the tree, or right-click to create one."
                action={
                  <Button variant="primary" size="sm" onClick={() => promptNewFile(workspace.root)}>
                    <Plus size={13} /> New file
                  </Button>
                }
              />
            </div>
          )}
        </div>
        <div className="border-t border-white/5 px-4 h-7 flex items-center justify-between text-[10px] text-text-muted">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-emerald-400/80">{workspace.name}</span>
            {active && <span className="truncate font-mono">{active.path}</span>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {active && (
              <>
                <span>{active.language}</span>
                <span>
                  Ln {cursor.line}, Col {cursor.col}
                </span>
                {active.truncated && <span className="text-amber-400">truncated</span>}
                <span>UTF-8</span>
                {dirty.has(active.path) && <span className="text-emerald-400">● unsaved</span>}
              </>
            )}
          </div>
        </div>
      </section>

      <NewEntryDialog dialog={dialog} setDialog={setDialog} submit={submitDialog} />
    </div>
  );
}

function NewEntryDialog({
  dialog,
  setDialog,
  submit,
}: {
  dialog: { mode: "file" | "folder"; value: string } | null;
  setDialog: (d: { mode: "file" | "folder"; value: string } | null) => void;
  submit: () => void;
}) {
  return (
    <Dialog
      open={!!dialog}
      onClose={() => setDialog(null)}
      title={dialog?.mode === "folder" ? "New folder" : "New file"}
      description="The full path is shown — edit the end to name it. Missing parent folders are created."
    >
      <div className="space-y-3">
        <Input
          autoFocus
          value={dialog?.value ?? ""}
          onChange={(e) => setDialog(dialog ? { ...dialog, value: e.target.value } : null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={dialog?.mode === "folder" ? "/path/to/folder" : "/path/to/file.ts"}
          className="font-mono text-xs"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDialog(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!dialog?.value.trim()}>
            Create
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
