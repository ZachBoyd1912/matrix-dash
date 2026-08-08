"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

interface Props {
  filePath: string;
  fileName: string;
  /** If true, shows a compact icon-only button instead of text+icon. */
  compact?: boolean;
}

/**
 * Downloads a file from the server and triggers the native "Save to Files"
 * dialog on iOS / download on desktop. Also offers Web Share as a fallback
 * for small files.
 */
export function DownloadButton({ filePath, fileName, compact }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    setBusy(true);
    try {
      const res = await fetch(`/api/files/download?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: "Download failed" }))) as {
          error?: string;
        };
        throw new Error(err.error ?? "Download failed");
      }

      const blob = await res.blob();

      // Try Web Share API first (lets user AirDrop, save to Files, etc.)
      if (navigator.share && navigator.canShare && blob.size < 50_000_000) {
        const shareData: { files: File[] } = {
          files: [new File([blob], fileName, { type: blob.type })],
        };
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return;
        }
      }

      // Fallback: create a download link (iOS shows "Save to Files" sheet).
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      // If user cancelled the share sheet, that's fine — don't show an error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Download failed:", err);
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <button
        onClick={handleDownload}
        disabled={busy}
        className="text-text-muted hover:text-text-primary grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-white/5"
        aria-label={`Download ${fileName}`}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      </button>
    );
  }

  return (
    <button
      onClick={handleDownload}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-white/5"
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      Download
    </button>
  );
}
