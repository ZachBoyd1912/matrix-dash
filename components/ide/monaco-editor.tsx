"use client";

import dynamic from "next/dynamic";
import type { OnChange, OnMount } from "@monaco-editor/react";

const Monaco = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center text-xs text-text-muted">
      Loading editor…
    </div>
  ),
});

interface Props {
  value: string;
  language: string;
  onChange: (next: string) => void;
}

export function MonacoEditor({ value, language, onChange }: Props) {
  const handleChange: OnChange = (next) => {
    onChange(next ?? "");
  };

  const handleMount: OnMount = (editor, monaco) => {
    monaco.editor.defineTheme("matrix-dash", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0a0a0a",
        "editor.foreground": "#e8e8e8",
        "editorLineNumber.foreground": "#555555",
        "editorLineNumber.activeForeground": "#888888",
        "editorCursor.foreground": "#34d399",
        "editor.selectionBackground": "#34d39933",
        "editor.lineHighlightBackground": "#ffffff08",
        "editorIndentGuide.background": "#ffffff0a",
      },
    });
    monaco.editor.setTheme("matrix-dash");
    editor.updateOptions({
      fontFamily: "var(--font-mono), JetBrains Mono, monospace",
      fontSize: 13,
      lineHeight: 22,
      smoothScrolling: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      minimap: { enabled: false },
      padding: { top: 16, bottom: 16 },
      fontLigatures: true,
    });
  };

  return (
    <Monaco
      height="100%"
      value={value}
      language={language}
      onChange={handleChange}
      onMount={handleMount}
      theme="vs-dark"
      options={{
        wordWrap: "on",
        scrollBeyondLastLine: false,
        renderLineHighlight: "all",
        automaticLayout: true,
      }}
    />
  );
}
