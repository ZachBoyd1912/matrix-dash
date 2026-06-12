export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string;
  folderId: string | null;
  isFavorite: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteLink {
  id: string;
  sourceNoteId: string;
  targetNoteId: string;
  label: string | null;
}

export interface NoteBacklinks {
  outgoing: { linkId: string; note: Pick<Note, "id" | "title"> }[];
  incoming: { linkId: string; note: Pick<Note, "id" | "title"> }[];
}
