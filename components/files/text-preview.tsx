"use client";

interface Props {
  content: string;
  language: string;
  truncated: boolean;
}

/** Read-only syntax-highlighted text/code viewer for the mobile preview sheet. */
export function TextPreview({ content, language, truncated }: Props) {
  return (
    <div className="p-4">
      {/* Language badge */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-text-secondary rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px]">
          {language}
        </span>
        {truncated && (
          <span className="text-[10px] text-amber-400">Preview truncated (first 500 KB)</span>
        )}
      </div>

      {/* Code block */}
      <pre className="bg-bg-surface overflow-x-auto rounded-lg border border-white/5 p-3 text-xs leading-relaxed">
        <code className={`language-${language} text-text-secondary font-mono`}>{content}</code>
      </pre>
    </div>
  );
}
