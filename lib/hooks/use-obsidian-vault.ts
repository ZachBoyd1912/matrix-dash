"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const NOTES_SUBDIR = "Matrix Notes";
const MEMORIES_SUBDIR = "Memory Bank";
const SYNC_INTERVAL_MS = 30 * 60 * 1000; // matches the user's own "on load or every 30 min" ask
const DB_NAME = "matrix-obsidian-vault";
const STORE = "handles";
const HANDLE_KEY = "vault";

// FileSystemHandle objects support structured clone, so IndexedDB can store
// them directly — no serialization needed, and no new dependency for
// something this small (raw IndexedDB, not idb-keyval).
function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function storeHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

interface ManifestEntry {
  relPath: string;
  mtimeMs: number;
}

async function walkSubdir(
  root: FileSystemDirectoryHandle,
  subdir: string
): Promise<{ dir: FileSystemDirectoryHandle; manifest: ManifestEntry[] }> {
  const dir = await root.getDirectoryHandle(subdir, { create: true });
  const manifest: ManifestEntry[] = [];
  // @ts-expect-error — FileSystemDirectoryHandle is async-iterable in browsers
  // that support the File System Access API; TS's lib.dom doesn't have this
  // typed yet (as of this codebase's TS target).
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== "file" || !name.endsWith(".md")) continue;
    const file = await (handle as FileSystemFileHandle).getFile();
    manifest.push({ relPath: name, mtimeMs: file.lastModified });
  }
  return { dir, manifest };
}

export type VaultSyncStatus = "idle" | "syncing" | "no-permission" | "unsupported";

interface SyncResult {
  pushed: number;
  pulled: number;
  at: string;
}

export function useObsidianVault() {
  const [connected, setConnected] = useState(false);
  const [vaultName, setVaultName] = useState<string | null>(null);
  const [status, setStatus] = useState<VaultSyncStatus>("idle");
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const handleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const supported = typeof window !== "undefined" && "showDirectoryPicker" in window;

  const sync = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) return;
    setStatus("syncing");
    try {
      const [notesWalk, memoriesWalk] = await Promise.all([
        walkSubdir(handle, NOTES_SUBDIR),
        walkSubdir(handle, MEMORIES_SUBDIR),
      ]);

      const planRes = await fetch("/api/notes/sync/browser-manifest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: notesWalk.manifest, memories: memoriesWalk.manifest }),
      });
      if (!planRes.ok) throw new Error("manifest request failed");
      const plan: {
        push: {
          notes: { id: string; relPath: string; content: string }[];
          memories: { id: string; relPath: string; content: string }[];
        };
        pull: { notes: string[]; memories: string[] };
      } = await planRes.json();

      const pushed = {
        notes: [] as { id: string; relPath: string; mtimeMs: number }[],
        memories: [] as { id: string; relPath: string; mtimeMs: number }[],
      };
      for (const [dir, items, bucket] of [
        [notesWalk.dir, plan.push.notes, pushed.notes],
        [memoriesWalk.dir, plan.push.memories, pushed.memories],
      ] as const) {
        for (const item of items) {
          const fileHandle = await dir.getFileHandle(item.relPath, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(item.content);
          await writable.close();
          const file = await fileHandle.getFile();
          bucket.push({ id: item.id, relPath: item.relPath, mtimeMs: file.lastModified });
        }
      }

      const pulled = {
        notes: [] as { relPath: string; content: string; mtimeMs: number }[],
        memories: [] as { relPath: string; content: string; mtimeMs: number }[],
      };
      for (const [dir, relPaths, bucket] of [
        [notesWalk.dir, plan.pull.notes, pulled.notes],
        [memoriesWalk.dir, plan.pull.memories, pulled.memories],
      ] as const) {
        for (const relPath of relPaths) {
          const fileHandle = await dir.getFileHandle(relPath);
          const file = await fileHandle.getFile();
          bucket.push({ relPath, content: await file.text(), mtimeMs: file.lastModified });
        }
      }

      const applyRes = await fetch("/api/notes/sync/browser-apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pushed, pulled }),
      });
      if (!applyRes.ok) throw new Error("apply request failed");
      const result: { pushed: number; pulled: number } = await applyRes.json();
      setLastResult({ ...result, at: new Date().toISOString() });
      setStatus("idle");
    } catch (err) {
      console.error("[use-obsidian-vault] sync failed:", err);
      setStatus("idle");
    }
  }, []);

  useEffect(() => {
    if (!supported) {
      setStatus("unsupported");
      return;
    }
    let cancelled = false;
    (async () => {
      const handle = await loadStoredHandle();
      if (!handle || cancelled) return;
      // @ts-expect-error — queryPermission is part of the File System Access
      // API's permission extension, not in TS's lib.dom typings yet.
      const perm = await handle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        setStatus("no-permission");
        return;
      }
      handleRef.current = handle;
      setConnected(true);
      setVaultName(handle.name);
      sync();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  useEffect(() => {
    if (!connected) return;
    const id = setInterval(sync, SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [connected, sync]);

  const connect = useCallback(async () => {
    if (!supported) return;
    // @ts-expect-error — showDirectoryPicker isn't in TS's lib.dom yet.
    const handle: FileSystemDirectoryHandle = await window.showDirectoryPicker({
      mode: "readwrite",
    });
    await storeHandle(handle);
    handleRef.current = handle;
    setConnected(true);
    setVaultName(handle.name);
    await sync();
  }, [supported, sync]);

  const disconnect = useCallback(async () => {
    handleRef.current = null;
    setConnected(false);
    setVaultName(null);
    try {
      const db = await openHandleDb();
      db.transaction(STORE, "readwrite").objectStore(STORE).delete(HANDLE_KEY);
    } catch {
      // best-effort
    }
  }, []);

  return { supported, connected, vaultName, status, lastResult, connect, disconnect, sync };
}
