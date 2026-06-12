"use client";

import { Fragment } from "react";
import { Markdown } from "@/components/chat/markdown";

interface Props {
  content: string;
  onNavigate?: (title: string) => void;
}

/**
 * Render markdown but intercept [[wiki-link]] tokens and turn them into
 * clickable spans. Naive but does the job for the editor preview.
 */
export function WikiContent({ content, onNavigate }: Props) {
  // Convert [[Title]] into a sentinel that survives ReactMarkdown rendering as
  // a styled anchor — easier to do client-side text substitution after render.
  const transformed = content.replace(
    /\[\[([^\[\]|]+)(?:\|([^\[\]]+))?\]\]/g,
    (_, title: string, label?: string) =>
      `[${label ?? title}](#wiki:${encodeURIComponent(title.trim())})`
  );

  return (
    <div
      onClick={(e) => {
        const target = e.target as HTMLElement;
        const anchor = target.closest("a");
        if (!anchor) return;
        const href = anchor.getAttribute("href") ?? "";
        if (href.startsWith("#wiki:")) {
          e.preventDefault();
          onNavigate?.(decodeURIComponent(href.slice("#wiki:".length)));
        }
      }}
    >
      <Markdown content={transformed} />
    </div>
  );
}

// Suppress "Fragment is unused" if linters complain — Markdown wrapper handles
// the AST itself. Keeping the import as an explicit no-op reference.
void Fragment;
