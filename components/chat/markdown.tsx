"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

interface Props {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: Props) {
  return (
    <div
      className={cn(
        "prose prose-invert prose-sm max-w-none text-sm leading-relaxed",
        "[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        "[&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5",
        "[&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm",
        "[&_a]:text-emerald-400 [&_a:hover]:underline",
        "[&_strong]:text-text-primary [&_em]:italic",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-emerald-400/30 [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary",
        "[&_code]:font-mono [&_code]:text-[12px] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-white/[0.06] [&_code]:text-emerald-200",
        "[&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!my-0",
        "[&_pre_code]:!bg-transparent [&_pre_code]:!p-0",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre({ children }) {
            return <CodeBlock>{children}</CodeBlock>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    const text = extractText(children);
    if (!text) return;
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  };

  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-white/5 bg-black/40">
      <button
        onClick={copy}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-white/5 text-text-muted hover:text-text-primary hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Copy code"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
      <pre className="overflow-x-auto p-4 text-[12px] leading-relaxed">{children}</pre>
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: React.ReactNode } }).props;
    if (props?.children) return extractText(props.children);
  }
  return "";
}
