"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  File,
  FileCode2,
  FileCog,
  FileJson,
  FileTerminal,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
} from "lucide-react";
import type { TreeEntry } from "@/types/workspace";
import { cn } from "@/lib/utils/cn";

export type ContextAction = "newFile" | "newFolder" | "rename" | "delete" | "copyPath" | "reveal";

interface Props {
  tree: TreeEntry[];
  activePath: string | null;
  onOpenFile: (path: string) => void;
  onNewFile: (dirPath: string) => void;
  onNewFolder: (dirPath: string) => void;
  onRename: (entry: TreeEntry, newName: string) => void;
  onDelete: (entry: TreeEntry) => void;
  onCopyPath: (path: string) => void;
}

interface IconSpec {
  Icon: typeof File;
  className: string;
}

function iconFor(name: string): IconSpec {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return { Icon: FileCode2, className: "text-sky-400" };
    case "py":
      return { Icon: FileCode2, className: "text-emerald-400" };
    case "go":
      return { Icon: FileCode2, className: "text-cyan-400" };
    case "rs":
      return { Icon: FileCode2, className: "text-orange-300" };
    case "json":
      return { Icon: FileJson, className: "text-amber-400" };
    case "md":
    case "mdx":
    case "txt":
      return { Icon: FileText, className: "text-violet-400" };
    case "css":
    case "scss":
    case "sass":
      return { Icon: FileCode2, className: "text-pink-400" };
    case "html":
    case "xml":
    case "svg":
      return { Icon: FileCode2, className: "text-orange-400" };
    case "sh":
    case "bash":
    case "zsh":
      return { Icon: FileTerminal, className: "text-lime-400" };
    case "yml":
    case "yaml":
    case "toml":
    case "ini":
    case "env":
      return { Icon: FileCog, className: "text-stone-300" };
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "ico":
    case "avif":
      return { Icon: ImageIcon, className: "text-fuchsia-400" };
    default:
      return { Icon: File, className: "text-text-muted" };
  }
}

interface MenuState {
  x: number;
  y: number;
  entry: TreeEntry;
}

export function FileTree({
  tree,
  activePath,
  onOpenFile,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onCopyPath,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; value: string } | null>(null);

  // Close the context menu on any outside interaction.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const toggle = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const openMenu = (e: React.MouseEvent, entry: TreeEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const startRename = (entry: TreeEntry) => {
    setMenu(null);
    setRenaming({ path: entry.path, value: entry.name });
  };

  const commitRename = (entry: TreeEntry) => {
    const value = renaming?.value.trim();
    setRenaming(null);
    if (value && value !== entry.name) onRename(entry, value);
  };

  const rows = useMemo(() => tree, [tree]);

  return (
    <>
      <div className="flex-1 overflow-y-auto p-1 select-none">
        {rows.length === 0 ? (
          <p className="text-text-muted px-2 py-8 text-center text-xs">
            This folder is empty.
            <br />
            Right-click to add a file.
          </p>
        ) : (
          <TreeNodes
            nodes={rows}
            depth={0}
            activePath={activePath}
            collapsed={collapsed}
            renaming={renaming}
            onToggle={toggle}
            onOpenFile={onOpenFile}
            onContext={openMenu}
            onRenameChange={(v) => setRenaming((r) => (r ? { ...r, value: v } : r))}
            onRenameCommit={commitRename}
            onRenameCancel={() => setRenaming(null)}
          />
        )}
      </div>

      {menu && (
        <div
          className="glass-strong fixed z-[60] min-w-[176px] rounded-lg border border-white/10 p-1 text-xs shadow-2xl"
          style={{
            top: Math.min(menu.y, window.innerHeight - 230),
            left: Math.min(menu.x, window.innerWidth - 190),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            label={menu.entry.type === "dir" ? "New file here" : "New file"}
            onClick={() => {
              const dir = menu.entry.type === "dir" ? menu.entry.path : parentOf(menu.entry.path);
              setMenu(null);
              onNewFile(dir);
            }}
          />
          <MenuItem
            label={menu.entry.type === "dir" ? "New folder here" : "New folder"}
            onClick={() => {
              const dir = menu.entry.type === "dir" ? menu.entry.path : parentOf(menu.entry.path);
              setMenu(null);
              onNewFolder(dir);
            }}
          />
          <div className="my-1 h-px bg-white/8" />
          <MenuItem label="Rename" onClick={() => startRename(menu.entry)} />
          <MenuItem
            label="Copy path"
            onClick={() => {
              onCopyPath(menu.entry.path);
              setMenu(null);
            }}
          />
          <div className="my-1 h-px bg-white/8" />
          <MenuItem
            label="Delete"
            danger
            onClick={() => {
              const entry = menu.entry;
              setMenu(null);
              onDelete(entry);
            }}
          />
        </div>
      )}
    </>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-md px-2.5 py-1.5 text-left transition-colors",
        danger
          ? "text-rose-300 hover:bg-rose-500/15"
          : "text-text-secondary hover:text-text-primary hover:bg-white/8"
      )}
    >
      {label}
    </button>
  );
}

interface NodesProps {
  nodes: TreeEntry[];
  depth: number;
  activePath: string | null;
  collapsed: Set<string>;
  renaming: { path: string; value: string } | null;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
  onContext: (e: React.MouseEvent, entry: TreeEntry) => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: (entry: TreeEntry) => void;
  onRenameCancel: () => void;
}

function TreeNodes(props: NodesProps) {
  const { nodes, depth, activePath, collapsed, renaming } = props;
  return (
    <ul className="space-y-px">
      {nodes.map((node) => {
        const pad = 6 + depth * 12;
        const isRenaming = renaming?.path === node.path;

        if (node.type === "dir") {
          const isOpen = !collapsed.has(node.path);
          return (
            <li key={node.path}>
              <div
                className="group text-text-secondary hover:text-text-primary flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-white/[0.04]"
                style={{ paddingLeft: pad }}
                onClick={() => props.onToggle(node.path)}
                onContextMenu={(e) => props.onContext(e, node)}
              >
                <ChevronRight
                  size={12}
                  className={cn(
                    "text-text-muted shrink-0 transition-transform",
                    isOpen && "rotate-90"
                  )}
                />
                {isOpen ? (
                  <FolderOpen size={13} className="shrink-0 text-amber-400" />
                ) : (
                  <Folder size={13} className="shrink-0 text-amber-400" />
                )}
                {isRenaming ? (
                  <RenameInput node={node} {...props} />
                ) : (
                  <span className="truncate">{node.name}</span>
                )}
              </div>
              {isOpen && node.children && node.children.length > 0 && (
                <TreeNodes {...props} nodes={node.children} depth={depth + 1} />
              )}
            </li>
          );
        }

        const isActive = activePath === node.path;
        const { Icon, className } = iconFor(node.name);
        return (
          <li key={node.path}>
            <div
              className={cn(
                "group flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors",
                isActive
                  ? "text-text-primary bg-white/[0.08]"
                  : "text-text-secondary hover:text-text-primary hover:bg-white/[0.04]"
              )}
              style={{ paddingLeft: pad + 13 }}
              onClick={() => props.onOpenFile(node.path)}
              onContextMenu={(e) => props.onContext(e, node)}
            >
              <Icon size={13} className={cn("shrink-0", className)} />
              {isRenaming ? (
                <RenameInput node={node} {...props} />
              ) : (
                <span className="flex-1 truncate">{node.name}</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RenameInput({
  node,
  renaming,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: NodesProps & { node: TreeEntry }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      value={renaming?.value ?? ""}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onRenameChange(e.target.value)}
      onBlur={() => onRenameCommit(node)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onRenameCommit(node);
        else if (e.key === "Escape") onRenameCancel();
      }}
      className="text-text-primary min-w-0 flex-1 rounded border border-emerald-400/40 bg-black/40 px-1 py-0 text-xs focus:outline-none"
    />
  );
}

function parentOf(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx > 0 ? p.slice(0, idx) : p;
}
