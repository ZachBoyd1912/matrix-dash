"use client";

import { Download, File, FileImage, FileText, FileArchive } from "lucide-react";
import type { AttachmentMeta } from "@/types/email";

interface Props {
  emailId: string;
  attachments: AttachmentMeta[];
}

function iconFor(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType === "application/pdf" || mimeType.startsWith("text/")) return FileText;
  if (/zip|compressed|tar|rar|7z/.test(mimeType)) return FileArchive;
  return File;
}

/** Bytes as a human size. Gmail reports 0 for some parts, hence the guard. */
function humanSize(bytes: number): string {
  if (!bytes || bytes < 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/**
 * The attachment strip under a message.
 *
 * Attachments were previously discarded during sync — the parser walked past
 * any part with a filename and nothing recorded that they existed, so a
 * message with a PDF looked identical to one without. Bytes are still not
 * stored: each row links to the download route, which fetches from Gmail on
 * demand.
 */
export function EmailAttachments({ emailId, attachments }: Props) {
  if (attachments.length === 0) return null;

  return (
    <div className="mt-4 border-t border-white/5 pt-3">
      <p className="text-text-muted mb-2 text-[10px] tracking-[0.16em] uppercase">
        {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
      </p>
      <div className="flex flex-wrap gap-2">
        {attachments.map((a) => {
          const Icon = iconFor(a.mimeType);
          const size = humanSize(a.size);
          return (
            <a
              key={a.attachmentId}
              href={`/api/emails/${emailId}/attachments/${encodeURIComponent(a.attachmentId)}`}
              // `download` asks the browser to save rather than navigate, which
              // matters because the response is served as an attachment anyway
              // and a navigation would blank the reading pane.
              download={a.filename}
              className="group text-text-secondary hover:text-text-primary flex max-w-[220px] items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-xs transition-colors hover:bg-white/[0.05]"
              title={`${a.filename}${size ? ` — ${size}` : ""}`}
            >
              <Icon size={13} className="shrink-0 opacity-70" />
              <span className="min-w-0 flex-1 truncate">{a.filename}</span>
              {size && <span className="text-text-muted shrink-0 text-[10px]">{size}</span>}
              <Download
                size={11}
                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-70"
              />
            </a>
          );
        })}
      </div>
    </div>
  );
}
