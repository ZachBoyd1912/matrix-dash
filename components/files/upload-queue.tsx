"use client";

import { useState } from "react";
import { Upload, X, Loader2, CheckCircle, AlertCircle } from "lucide-react";

interface QueuedFile {
  id: string;
  name: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

export type { QueuedFile };

interface Props {
  files: QueuedFile[];
  destinationPath: string;
  onComplete: () => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export function UploadQueue({ files, destinationPath, onComplete, onRemove, onClose }: Props) {
  const [uploading, setUploading] = useState(false);

  async function startUpload() {
    setUploading(true);
    const formData = new FormData();
    formData.set("destinationPath", destinationPath);
    for (const f of files) {
      if (f.status !== "error") formData.append("files", f.file, f.name);
    }

    try {
      const res = await fetch("/api/files/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Upload failed");
      }
      onComplete();
    } catch (err) {
      // Mark all as error
      files.forEach((f) => {
        f.status = "error";
        f.error = (err as Error).message;
      });
    } finally {
      setUploading(false);
    }
  }

  const doneCount = files.filter((f) => f.status === "done").length;
  const allDone = doneCount === files.length || (uploading && doneCount === files.length);

  return (
    <div
      className="glass-strong fixed right-0 bottom-0 left-0 z-50 flex max-h-[50dvh] flex-col rounded-t-2xl md:relative md:rounded-none"
      style={{ paddingBottom: "var(--safe-area-bottom)" }}
    >
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h3 className="text-text-primary text-sm font-semibold">
          Upload {files.length} {files.length === 1 ? "file" : "files"}
        </h3>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary grid h-7 w-7 place-items-center rounded-md hover:bg-white/5"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-2">
            {f.status === "done" ? (
              <CheckCircle size={16} className="shrink-0 text-emerald-400" />
            ) : f.status === "error" ? (
              <AlertCircle size={16} className="shrink-0 text-rose-400" />
            ) : uploading ? (
              <Loader2 size={16} className="text-text-muted shrink-0 animate-spin" />
            ) : (
              <Upload size={16} className="text-text-muted shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-text-primary truncate text-xs">{f.name}</p>
              {f.error && <p className="text-[10px] text-rose-400">{f.error}</p>}
              {f.status === "pending" && (
                <p className="text-text-muted text-[10px]">{(f.file.size / 1024).toFixed(0)} KB</p>
              )}
            </div>
            {f.status === "pending" && !uploading && (
              <button
                onClick={() => onRemove(f.id)}
                className="text-text-muted shrink-0 p-1 hover:text-rose-400"
                aria-label={`Remove ${f.name}`}
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
      </div>

      {!allDone && (
        <div className="border-t border-white/5 p-3">
          <button
            onClick={startUpload}
            disabled={uploading || files.length === 0}
            className="w-full rounded-lg bg-emerald-400/15 py-2.5 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-400/25 disabled:opacity-40"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Uploading…
              </span>
            ) : (
              `Upload to ${destinationPath.split("/").pop() || "~"}`
            )}
          </button>
        </div>
      )}
    </div>
  );
}
