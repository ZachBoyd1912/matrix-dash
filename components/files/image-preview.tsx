"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  filePath: string;
  fileName: string;
}

/** Full-screen image viewer with pinch-to-zoom for the mobile preview sheet. */
export function ImagePreview({ filePath, fileName }: Props) {
  const [loaded, setLoaded] = useState(false);

  const url = `/api/files/download?path=${encodeURIComponent(filePath)}`;

  return (
    <div className="flex items-center justify-center p-4" style={{ minHeight: 200 }}>
      {!loaded && (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="text-text-muted h-6 w-6 animate-spin" />
          <p className="text-text-muted text-xs">Loading image…</p>
        </div>
      )}
      <img
        src={url}
        alt={fileName}
        onLoad={() => setLoaded(true)}
        className="max-h-[65vh] max-w-full rounded-lg object-contain"
        style={{
          display: loaded ? "block" : "none",
          touchAction: "pinch-zoom",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
      />
    </div>
  );
}
