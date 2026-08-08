"use client";

import { useRef } from "react";
import { Camera } from "lucide-react";

interface Props {
  onCapture: (file: File) => void;
}

/** Opens the native iOS camera via `<input capture="environment">`. */
export function CameraButton({ onCapture }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        capture="environment"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onCapture(file);
          // Reset so the same file can be re-captured
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="text-text-muted hover:text-text-primary grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-white/5"
        aria-label="Take photo"
      >
        <Camera size={16} />
      </button>
    </>
  );
}
