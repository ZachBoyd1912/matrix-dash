"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { FileEntry, ReadResult } from "@/lib/files-security";
import { TextPreview } from "./text-preview";
import { ImagePreview } from "./image-preview";
import { DownloadButton } from "./download-button";

interface Props {
  file: FileEntry;
  onClose: () => void;
}

/** Bottom-sheet overlay that previews a file — text, image, or download-only. */
export function FilePreviewSheet({ file, onClose }: Props) {
  const [data, setData] = useState<ReadResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    function loadFilePreview() {
      setLoading(true);
      setError(null);
      fetch(`/api/files/read?path=${encodeURIComponent(file.path)}`)
        .then(async (res) => {
          if (!res.ok) {
            const err = (await res.json()) as { error?: string };
            throw new Error(err.error ?? "Could not read file");
          }
          return res.json() as Promise<ReadResult & { binary?: boolean }>;
        })
        .then((result) => {
          setData(result);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Failed to load preview");
        })
        .finally(() => setLoading(false));
    },
    [file.path]
  );

  const imageExts = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
  const isImage = file.extension && imageExts.has(file.extension);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        className="glass-strong relative z-10 mt-auto flex max-h-[85dvh] flex-col rounded-t-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "var(--safe-area-bottom)" }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-text-primary truncate text-sm font-medium">{file.name}</p>
            <p className="text-text-muted text-[11px]">
              {file.size != null ? `${(file.size / 1024).toFixed(1)} KB` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DownloadButton filePath={file.path} fileName={file.name} />
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-white/5"
              aria-label="Close preview"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="text-text-muted h-6 w-6 animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-2 py-16">
              <p className="text-text-secondary text-sm">{error}</p>
              <DownloadButton filePath={file.path} fileName={file.name} />
            </div>
          )}

          {!loading && !error && data && isImage && (
            <ImagePreview filePath={file.path} fileName={file.name} />
          )}

          {!loading && !error && data && !isImage && data.language !== "binary" && (
            <TextPreview
              content={data.content}
              language={data.language}
              truncated={data.truncated}
            />
          )}

          {!loading && !error && data && data.language === "binary" && (
            <div className="flex flex-col items-center gap-3 py-16">
              <p className="text-text-secondary text-sm">
                Preview not available for this file type
              </p>
              <p className="text-text-muted text-xs">
                {file.size != null ? `${(file.size / 1024).toFixed(1)} KB` : ""}
              </p>
              <DownloadButton filePath={file.path} fileName={file.name} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
