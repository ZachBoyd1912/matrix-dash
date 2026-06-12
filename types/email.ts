export type EmailFolder = "inbox" | "sent" | "drafts" | "trash";

export interface Email {
  id: string;
  folder: EmailFolder;
  fromAddr: string;
  toAddr: string;
  subject: string;
  body: string;
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
