export interface Session {
  id: string;
  name: string;
  context: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionWithCount extends Session {
  messageCount: number;
}

export type MessageRole = "user" | "assistant" | "system";

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  providerId: string | null;
  modelName: string | null;
  createdAt: string;
}
