export interface AttachmentMeta {
  /** Gmail's handle for fetching the bytes; absent for a tiny inline part. */
  attachmentId: string;
  filename: string;
  mimeType: string;
  /** Size in bytes as Gmail reports it. */
  size: number;
}

export type EmailFolder = "inbox" | "sent" | "drafts" | "trash";

export interface Email {
  id: string;
  folder: EmailFolder;
  fromAddr: string;
  toAddr: string;
  subject: string;
  /** Always plain text — safe to render directly in a list preview. */
  body: string;
  /**
   * Sanitized HTML, present only on the single-email GET. Null for genuinely
   * plain-text mail, which renders as pre-wrapped text instead. Never included
   * in list responses: 400KB of markup per row would dwarf the payload.
   */
  bodyHtml?: string | null;
  /**
   * Full metadata, on the single-email GET only — bytes come from
   * /api/emails/[id]/attachments/[attachmentId].
   */
  attachments?: AttachmentMeta[];
  /**
   * Presence flag, sent by the LIST endpoint instead of the metadata itself.
   * The list only draws a paperclip, and a folder response covers thousands of
   * messages, so shipping the real array per row is payload spent for nothing.
   */
  hasAttachments?: boolean;
  isRead: boolean | null;
  isStarred: boolean | null;
  createdAt: string;
}

export const EMAIL_FOLDERS: { value: EmailFolder; label: string }[] = [
  { value: "inbox", label: "Inbox" },
  { value: "sent", label: "Sent" },
  { value: "drafts", label: "Drafts" },
  { value: "trash", label: "Trash" },
];
