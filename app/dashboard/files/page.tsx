"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FolderOpen, Loader2, AlertTriangle, Upload } from "lucide-react";
import { useOnlineStatus } from "@/lib/hooks/use-online-status";
import { PathBreadcrumb } from "@/components/files/path-breadcrumb";
import { DirectoryListing } from "@/components/files/directory-listing";
import { FilePreviewSheet } from "@/components/files/file-preview-sheet";
import { CameraButton } from "@/components/files/camera-button";
import { UploadQueue, type QueuedFile } from "@/components/files/upload-queue";
import type { BrowseResult, FileEntry } from "@/lib/files-security";

function newQueuedFile(file: File): QueuedFile {
  return { id: crypto.randomUUID(), name: file.name, file, progress: 0, status: "pending" };
}

export default function FilesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const online = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPath = searchParams.get("path") || "";

  const [browse, setBrowse] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);
  const [uploadFiles, setUploadFiles] = useState<QueuedFile[]>([]);
  const [showUploadQueue, setShowUploadQueue] = useState(false);

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

  // Camera capture → add to upload queue
  function handleCameraCapture(file: File) {
    setUploadFiles((prev) => [...prev, newQueuedFile(file)]);
    setShowUploadQueue(true);
  }

  // File picker (multi)
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newFiles: QueuedFile[] = [];
    for (let i = 0; i < files.length; i++) {
      newFiles.push(newQueuedFile(files[i]));
    }
    setUploadFiles((prev) => [...prev, ...newFiles]);
    setShowUploadQueue(true);
    e.target.value = "";
  }

  function handleUploadComplete() {
    setUploadFiles([]);
    setShowUploadQueue(false);
    fetchDir(); // refresh listing
  }

  function removeUploadFile(id: string) {
    setUploadFiles((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (next.length === 0) setShowUploadQueue(false);
      return next;
    });
  }

  // Pull-to-refresh
  useEffect(
    function setupPullToRefresh() {
      let startY = 0;
      let pulling = false;
      const el = document.getElementById("files-scroll");
      const onTS = (e: TouchEvent) => {
        if (el && el.scrollTop <= 0) {
          startY = e.touches[0].clientY;
          pulling = true;
        }
      };
      const onTM = (e: TouchEvent) => {
        if (!pulling) return;
        if (e.touches[0].clientY - startY > 80 && el && el.scrollTop <= 0) {
          pulling = false;
          fetchDir();
        }
      };
      const onTE = () => {
        pulling = false;
      };
      el?.addEventListener("touchstart", onTS, { passive: true });
      el?.addEventListener("touchmove", onTM, { passive: true });
      el?.addEventListener("touchend", onTE);
      return () => {
        el?.removeEventListener("touchstart", onTS);
        el?.removeEventListener("touchmove", onTM);
        el?.removeEventListener("touchend", onTE);
      };
    },
    [fetchDir]
  );

  const destination = browse?.path || "";

  return (
    <div className="mx-auto max-w-2xl">
      {/* Hidden multi-file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      <div
        id="files-scroll"
        className="flex h-[calc(100dvh-7rem)] flex-col overflow-y-auto md:h-[calc(100dvh-3.5rem)]"
      >
        {/* Breadcrumb + actions */}
        <div className="bg-bg-base/90 sticky top-0 z-10 flex items-center gap-1 px-4 py-2 backdrop-blur-md">
          <div className="min-w-0 flex-1">
            {browse && (
              <PathBreadcrumb
                currentPath={browse.path}
                name={browse.name}
                onNavigate={navigateTo}
              />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <CameraButton onCapture={handleCameraCapture} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-text-muted hover:text-text-primary grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-white/5"
              aria-label="Upload files"
            >
              <Upload size={16} />
            </button>
          </div>
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

        {previewFile && <FilePreviewSheet file={previewFile} onClose={handleClosePreview} />}
      </div>

      {showUploadQueue && uploadFiles.length > 0 && (
        <UploadQueue
          files={uploadFiles}
          destinationPath={destination}
          onComplete={handleUploadComplete}
          onRemove={removeUploadFile}
          onClose={() => setShowUploadQueue(false)}
        />
      )}
    </div>
  );
}
