"use client";

import { useMemo, useState } from "react";
import { Code2, Eye, Copy, Check, Download, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Markdown } from "./markdown";

export interface Artifact {
  code: string;
  lang: string;
}

/**
 * Pull the most "previewable" block (a full or partial HTML / SVG document) out
 * of a markdown string. This is what turns "a model dumped code at me" into a
 * live, rendered website. Returns null when there's nothing worth previewing.
 */
export function extractArtifact(md: string): Artifact | null {
  if (!md) return null;
  const fence = /```([\w-]*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let best: Artifact | null = null;
  while ((m = fence.exec(md))) {
    const lang = (m[1] || "").toLowerCase();
    const code = m[2];
    const looksHtml = /<!doctype html|<html[\s>]|<body[\s>]|<svg[\s>]/i.test(code);
    if (lang === "html" || lang === "svg" || lang === "xml" || looksHtml) {
      // Prefer the largest previewable block (the real page over a snippet).
      if (!best || code.length > best.code.length) {
        best = { code, lang: lang || (/<svg/i.test(code) ? "svg" : "html") };
      }
    }
  }
  // Also catch a raw, un-fenced full HTML document streamed straight into the reply.
  if (!best && /<!doctype html|<html[\s>]/i.test(md)) {
    const start = md.search(/<!doctype html|<html[\s>]/i);
    best = { code: md.slice(start), lang: "html" };
  }
  return best;
}

function toSrcDoc(a: Artifact): string {
  const code = a.code.trim();
  if (/<html[\s>]|<!doctype/i.test(code)) return code;
  if (a.lang === "svg" || /^<svg/i.test(code)) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;display:grid;place-items:center;background:#0a0a0a}</style></head><body>${code}</body></html>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#0a0a0a;color:#e8e8e8;font-family:system-ui,sans-serif}</style></head><body>${code}</body></html>`;
}

interface Props {
  artifact: Artifact;
  title?: string;
  /** Preview viewport height. */
  height?: number;
}

export function ArtifactPanel({ artifact, title, height = 440 }: Props) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);
  const srcDoc = useMemo(() => toSrcDoc(artifact), [artifact]);

  const copy = () => {
    navigator.clipboard.writeText(artifact.code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  };
  const withBlob = (fn: (url: string) => void) => {
    const url = URL.createObjectURL(new Blob([srcDoc], { type: "text/html" }));
    fn(url);
  };
  const download = () =>
    withBlob((url) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = `artifact-${title?.toLowerCase().replace(/\s+/g, "-") || "page"}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    });
  const openTab = () => withBlob((url) => window.open(url, "_blank", "noopener"));

  return (
    <div className="bezel mt-3">
      <div className="bezel-core overflow-hidden">
        <div className="flex h-10 items-center justify-between gap-2 border-b border-white/5 px-3">
          <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            <span className="text-text-secondary truncate font-medium">
              {title || "Live artifact"}
            </span>
            <span className="text-text-muted shrink-0">· {artifact.lang || "html"}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Seg
              active={tab === "preview"}
              onClick={() => setTab("preview")}
              icon={<Eye size={12} />}
            >
              Preview
            </Seg>
            <Seg active={tab === "code"} onClick={() => setTab("code")} icon={<Code2 size={12} />}>
              Code
            </Seg>
            <span className="mx-1 h-4 w-px bg-white/10" />
            <IconBtn onClick={copy} label="Copy code">
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </IconBtn>
            <IconBtn onClick={openTab} label="Open in new tab">
              <ExternalLink size={12} />
            </IconBtn>
            <IconBtn onClick={download} label="Download .html">
              <Download size={12} />
            </IconBtn>
          </div>
        </div>

        {tab === "preview" ? (
          <iframe
            title="artifact preview"
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-popups allow-forms allow-modals"
            className="block w-full bg-white"
            style={{ height }}
          />
        ) : (
          <div className="overflow-auto p-3" style={{ maxHeight: height }}>
            <Markdown
              content={"```" + (artifact.lang || "html") + "\n" + artifact.code + "\n```"}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Seg({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium transition-all duration-200",
        active
          ? "bg-emerald-400/15 text-emerald-300"
          : "text-text-muted hover:text-text-primary hover:bg-white/5"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function IconBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-text-muted hover:text-text-primary grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-white/5"
    >
      {children}
    </button>
  );
}
