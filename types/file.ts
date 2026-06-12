export interface FileRecord {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type FileMeta = Omit<FileRecord, "content">;
