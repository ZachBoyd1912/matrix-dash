"use client";

import { useMemo } from "react";
import { Folder, FileCode2, Plus, Trash2 } from "lucide-react";
import type { FileMeta } from "@/types/file";
import { cn } from "@/lib/utils/cn";

interface Props {
  files: FileMeta[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

interface TreeFolder {
  type: "folder";
  name: string;
  path: string;
  children: TreeNode[];
}

interface TreeFile {
  type: "file";
  file: FileMeta;
}

type TreeNode = TreeFolder | TreeFile;

function buildTree(files: FileMeta[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeFolder>();

  // Stable order: by path.
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sorted) {
    const parts = file.path.split("/").filter(Boolean);
    let parent: TreeNode[] = root;
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      let folder = folderMap.get(acc);
      if (!folder) {
        folder = { type: "folder", name: parts[i], path: acc, children: [] };
        folderMap.set(acc, folder);
        parent.push(folder);
      }
      parent = folder.children;
    }
    parent.push({ type: "file", file });
  }

  return root;
}

export function FileTree({ files, activeId, onOpen, onCreate, onDelete }: Props) {
  const tree = useMemo(() => buildTree(files), [files]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">Files</span>
        <button
          onClick={onCreate}
          className="text-text-muted hover:text-text-primary p-1 rounded-md hover:bg-white/5 transition-colors"
          aria-label="New file"
        >
          <Plus size={12} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {files.length === 0 ? (
          <p className="text-xs text-text-muted text-center py-8 px-2">
            No files yet.<br />Click + to create one.
          </p>
        ) : (
          <Tree nodes={tree} activeId={activeId} onOpen={onOpen} onDelete={onDelete} depth={0} />
        )}
      </div>
    </div>
  );
}

interface TreeProps {
  nodes: TreeNode[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  depth: number;
}

function Tree({ nodes, activeId, onOpen, onDelete, depth }: TreeProps) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        if (node.type === "folder") {
          return (
            <li key={`folder-${node.path}`}>
              <div
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-text-secondary text-xs"
                style={{ paddingLeft: `${8 + depth * 12}px` }}
              >
                <Folder size={11} className="text-amber-400" />
                <span className="truncate">{node.name}</span>
              </div>
              <Tree
                nodes={node.children}
                activeId={activeId}
                onOpen={onOpen}
                onDelete={onDelete}
                depth={depth + 1}
              />
            </li>
          );
        }
        const isActive = activeId === node.file.id;
        return (
          <li key={node.file.id} className="group">
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-pointer transition-colors",
                isActive
                  ? "bg-white/[0.07] text-text-primary"
                  : "text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
              )}
              style={{ paddingLeft: `${8 + depth * 12}px` }}
              onClick={() => onOpen(node.file.id)}
            >
              <FileCode2 size={11} className="shrink-0 text-sky-400" />
              <span className="flex-1 truncate">{node.file.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(node.file.id);
                }}
                className="text-text-muted hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Delete file"
              >
                <Trash2 size={10} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
