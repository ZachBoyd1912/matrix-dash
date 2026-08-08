"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FolderOpen, Loader2, AlertTriangle } from "lucide-react";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { PathBreadcrumb } from "@/components/files/path-breadcrumb";
import { DirectoryListing } from "@/components/files/directory-listing";
import { FilePreviewSheet } from "@/components/files/file-preview-sheet";
import type { BrowseResult, FileEntry } from "@/lib/files-security";

export default function FilesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const online = useOnlineStatus();

  const currentPath = searchParams.get("path") || "";

  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);

  const fetchDir = useCallback(
    async function fetchDirectoryListing(pathOverride?: string) {
      setLoading(true);
      setError(null);
      const target = pathOverride ?? currentPath;
      try {
        const params = target ? `?path=${encodeURIComponent(target)}` : "";
        const res = await fetch(`/api/files/browse${params}`);
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Could not load folder");
        }
        const data = (await res.json()) as BrowseResult;
        setBrowse(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [currentPath]
  );

  useEffect(
    function loadDirectoryOnMount() {
      fetchDir();
    },
    [fetchDir]
  );

  function navigateTo(dirPath: string) {
    const params = new URLSearchParams(searchParams);
    params.set("path", dirPath);
    router.push(`/dashboard/files?${params.toString()}`);
  }

  function handleFileTap(file: FileEntry) {
    setPreviewFile(file);
  }

  function handleClosePreview() {
    setPreviewFile(null);
  }

  // Pull-to-refresh
  useEffect(
    function setupPullToRefresh() {
      let startY = 0;
      let pulling = false;
      const el = document.getElementById("files-scroll");

      function onTouchStart(e: TouchEvent) {
        if (el && el.scrollTop <= 0) {
          startY = e.touches[0].clientY;
          pulling = true;
        }
      }
      function onTouchMove(e: TouchEvent) {
        if (!pulling) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 80 && el && el.scrollTop <= 0) {
          pulling = false;
          fetchDir();
        }
      }
      function onTouchEnd() {
        pulling = false;
      }

      el?.addEventListener("touchstart", onTouchStart, { passive: true });
      el?.addEventListener("touchmove", onTouchMove, { passive: true });
      el?.addEventListener("touchend", onTouchEnd);

      return function cleanupPullToRefresh() {
        el?.removeEventListener("touchstart", onTouchStart);
        el?.removeEventListener("touchmove", onTouchMove);
        el?.removeEventListener("touchend", onTouchEnd);
      };
    },
    [fetchDir]
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div
        id="files-scroll"
        className="flex h-[calc(100dvh-7rem)] flex-col overflow-y-auto md:h-[calc(100dvh-3.5rem)]"
      >
        {/* Breadcrumb */}
        <div className="bg-bg-base/90 sticky top-0 z-10 px-4 py-2 backdrop-blur-md">
          {browse && (
            <PathBreadcrumb currentPath={browse.path} name={browse.name} onNavigate={navigateTo} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 px-4 pb-14">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="text-text-muted h-6 w-6 animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <AlertTriangle className="h-8 w-8 text-amber-400" />
              <p className="text-text-secondary text-sm">{error}</p>
              <button
                onClick={() => fetchDir()}
                className="text-sm text-emerald-400 underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && browse && browse.entries.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-20">
              <FolderOpen className="text-text-muted h-10 w-10" />
              <p className="text-text-muted text-sm">This folder is empty</p>
            </div>
          )}

          {!loading && !error && browse && browse.entries.length > 0 && (
            <DirectoryListing
              entries={browse.entries}
              onNavigate={navigateTo}
              onFileTap={handleFileTap}
            />
          )}

          {!online && (
            <div className="text-text-muted mt-4 text-center text-xs">
              Offline — showing cached listing
            </div>
          )}
        </div>

        {/* Preview sheet */}
        {previewFile && <FilePreviewSheet file={previewFile} onClose={handleClosePreview} />}
      </div>
    </div>
  );
}
