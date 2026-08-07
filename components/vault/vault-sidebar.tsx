"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  CloudOff,
  File as FileIcon,
  FileText,
  Folder,
  Plus,
  Search,
  Clock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/utils/time";
import { cn } from "@/lib/utils/cn";
import type {
  VaultIndexResponse,
  VaultSearchHit,
  VaultTreeFile,
  VaultTreeFolder,
} from "@/types/vault";

interface Props {
  index: VaultIndexResponse | null;
  /** Null while no search is active; [] means "searched, found nothing". */
  searchResults: VaultSearchHit[] | null;
  searching: boolean;
  selectedPath: string | null;
  onSelectPath: (relPath: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  onNewNote: () => void;
  onNewMemory: () => void;
  /**
   * A path to reveal — set when the user clicks a graph node. Every ancestor
   * folder expands so the file is actually visible, which is what "reveal in
   * the sidebar" means and what clicking a node in Obsidian does.
   */
  revealPath: string | null;
}

const FOLDER_STORAGE_KEY = "matrix-vault-open-folders";

/** Stable identity so a pre-hydration render doesn't remount the whole tree. */
const EMPTY: ReadonlySet<string> = new Set<string>();

/** Every ancestor folder path of a file, root-first. */
function ancestors(relPath: string): string[] {
  const segments = relPath.split("/");
  const out: string[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    out.push(segments.slice(0, i + 1).join("/"));
  }
  return out;
}

function FileRow({
  file,
  depth,
  active,
  onSelect,
}: {
  file: VaultTreeFile;
  depth: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      style={{ paddingLeft: 10 + depth * 12 }}
      className={cn(
        "flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-xs transition-colors",
        active
          ? "bg-white/[0.06] text-emerald-400 ring-1 ring-emerald-400/20"
          : "text-text-secondary hover:text-text-primary hover:bg-white/[0.03]"
      )}
      title={file.relPath}
    >
      {file.isText ? (
        <FileText size={11} className="shrink-0 opacity-60" />
      ) : (
        <FileIcon size={11} className="shrink-0 opacity-40" />
      )}
      <span className="truncate">{file.name.replace(/\.md$/i, "")}</span>
      {file.notInVault && (
        <span
          className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/60"
          title="Not written to the vault yet"
        />
      )}
    </button>
  );
}

function FolderNode({
  folder,
  depth,
  openFolders,
  onToggle,
  selectedPath,
  onSelectPath,
  onAdd,
}: {
  folder: VaultTreeFolder;
  depth: number;
  openFolders: ReadonlySet<string>;
  onToggle: (path: string) => void;
  selectedPath: string | null;
  onSelectPath: (relPath: string) => void;
  onAdd?: () => void;
}) {
  const open = openFolders.has(folder.path);
  return (
    <div>
      <div className="group flex items-center">
        <button
          onClick={() => onToggle(folder.path)}
          style={{ paddingLeft: 6 + depth * 12 }}
          className="text-text-secondary hover:text-text-primary flex flex-1 items-center gap-1.5 rounded-md py-1.5 pr-1 text-left text-xs font-medium transition-colors hover:bg-white/[0.03]"
        >
          <ChevronDown
            size={11}
            className={cn("shrink-0 transition-transform", !open && "-rotate-90")}
          />
          <Folder size={12} className="shrink-0 opacity-70" />
          <span className="flex-1 truncate">{folder.name}</span>
          <span className="text-text-muted text-[10px] tabular-nums">{folder.fileCount}</span>
        </button>
        {onAdd && (
          <button
            onClick={onAdd}
            aria-label={`New item in ${folder.name}`}
            className="text-text-muted hover:text-text-primary rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Plus size={12} />
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-0.5">
          {folder.folders.map((child) => (
            <FolderNode
              key={child.path}
              folder={child}
              depth={depth + 1}
              openFolders={openFolders}
              onToggle={onToggle}
              selectedPath={selectedPath}
              onSelectPath={onSelectPath}
            />
          ))}
          {folder.files.map((file) => (
            <FileRow
              key={file.relPath}
              file={file}
              depth={depth + 1}
              active={selectedPath === file.relPath}
              onSelect={() => onSelectPath(file.relPath)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The vault's real folder structure, discovered from the index rather than
 * hardcoded — so `Claude Code/Sessions/`, the vault's own README.md, and any
 * folder the operator adds later all appear without a code change. The two
 * folders matrix-dash owns pin to the top (server-side, see compareTopFolders)
 * and get a "new" affordance; everything else is browse-only.
 */
export function VaultSidebar({
  index,
  searchResults,
  searching,
  selectedPath,
  onSelectPath,
  query,
  onQueryChange,
  onNewNote,
  onNewMemory,
  revealPath,
}: Props) {
  // Null until localStorage has been read: rendering the tree before then, then
  // expanding it, makes the sidebar visibly collapse and re-open on every load.
  const [openFolders, setOpenFolders] = useState<Set<string> | null>(null);
  const needsSeed = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FOLDER_STORAGE_KEY);
      if (saved) {
        setOpenFolders(new Set(JSON.parse(saved) as string[]));
        return;
      }
    } catch {
      /* corrupt storage just means everything starts collapsed */
    }
    needsSeed.current = true;
    setOpenFolders(new Set());
  }, []);

  // Persisting in an effect rather than inside the state updater: React may
  // call an updater more than once, and a writer that runs on a discarded
  // render would save expansion the user never actually chose.
  useEffect(() => {
    if (!openFolders) return;
    try {
      localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify([...openFolders]));
    } catch {
      /* private mode / quota — expansion just won't persist */
    }
  }, [openFolders]);

  const toggle = useCallback((folderPath: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!revealPath) return;
    setOpenFolders((prev) => {
      const next = new Set(prev ?? []);
      for (const a of ancestors(revealPath)) next.add(a);
      return next;
    });
  }, [revealPath]);

  // Nothing stored yet: open the folders matrix-dash owns so a first visit
  // shows something useful rather than a wall of collapsed rows.
  useEffect(() => {
    if (!index || !needsSeed.current) return;
    needsSeed.current = false;
    const seeded = index.folders.slice(0, 2).map((f) => f.path);
    if (seeded.length > 0) setOpenFolders(new Set(seeded));
  }, [index]);

  const addHandlers = useMemo(
    () => ({ "Matrix Notes": onNewNote, "Memory Bank": onNewMemory }) as Record<string, () => void>,
    [onNewNote, onNewMemory]
  );

  const trimmed = query.trim();

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-white/5 bg-white/[0.01]">
      <div className="border-b border-white/5 p-3">
        <div className="relative">
          <Search size={13} className="text-text-muted absolute top-1/2 left-3 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search the whole vault…"
            aria-label="Search the whole vault"
            className="h-9 pl-9 text-xs"
          />
        </div>
      </div>

      {index && (index.unreachable || index.partial) && (
        <div className="flex items-start gap-2 border-b border-amber-400/15 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-300/90">
          <CloudOff size={12} className="mt-0.5 shrink-0" />
          <span>
            {index.unreachable
              ? "Vault unreachable — showing the last indexed copy."
              : "Only part of the vault refreshed this time; the rest is from the last scan."}
            {index.indexedAt && (
              <span className="text-text-muted ml-1 inline-flex items-center gap-1">
                <Clock size={9} /> {timeAgo(index.indexedAt)}
              </span>
            )}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {trimmed ? (
          searchResults === null || searching ? (
            <Skeleton className="h-8" />
          ) : searchResults.length === 0 ? (
            <p className="text-text-muted px-2 py-1 text-[11px]">
              Nothing in the vault matches “{trimmed}”.
            </p>
          ) : (
            searchResults.map((hit) => (
              <button
                key={hit.relPath}
                onClick={() => onSelectPath(hit.relPath)}
                className={cn(
                  "block w-full rounded-md px-2 py-1.5 text-left transition-colors",
                  selectedPath === hit.relPath
                    ? "bg-white/[0.06] ring-1 ring-emerald-400/20"
                    : "hover:bg-white/[0.03]"
                )}
              >
                <span
                  className={cn(
                    "block truncate text-xs",
                    selectedPath === hit.relPath ? "text-emerald-400" : "text-text-secondary"
                  )}
                >
                  {hit.name.replace(/\.md$/i, "")}
                </span>
                <span className="text-text-muted block truncate text-[10px]">
                  {hit.snippet || hit.relPath}
                </span>
              </button>
            ))
          )
        ) : index === null ? (
          <div className="space-y-1 p-1">
            <Skeleton className="h-7" />
            <Skeleton className="h-7" />
            <Skeleton className="h-7" />
          </div>
        ) : index.fileCount === 0 ? (
          <p className="text-text-muted px-2 py-2 text-[11px]">
            No vault indexed yet — set the vault path in Settings → Integrations → Obsidian.
          </p>
        ) : (
          <>
            {index.folders.map((folder) => (
              <FolderNode
                key={folder.path}
                folder={folder}
                depth={0}
                openFolders={openFolders ?? EMPTY}
                onToggle={toggle}
                selectedPath={selectedPath}
                onSelectPath={onSelectPath}
                onAdd={addHandlers[folder.name]}
              />
            ))}
            {index.rootFiles.map((file) => (
              <FileRow
                key={file.relPath}
                file={file}
                depth={0}
                active={selectedPath === file.relPath}
                onSelect={() => onSelectPath(file.relPath)}
              />
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
