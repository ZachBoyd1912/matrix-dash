export interface Session {
  id: string;
  name: string;
  context: string;
  parentSessionId: string | null;
  forkedFromMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionWithCount extends Session {
  messageCount: number;
}

export type MessageRole = "user" | "assistant" | "system";

export interface MessageVariant {
  content: string;
  blocks: string | null;
  providerId: string | null;
  providerKind: string | null;
  modelName: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  /** JSON-encoded Block[] — the structured transcript. Null for legacy/plain rows. */
  blocks: string | null;
  providerId: string | null;
  modelName: string | null;
  /** JSON-encoded MessageVariant[] — populated once a message has been regenerated at least once. */
  variants: string | null;
  activeVariantIndex: number;
  createdAt: string;
}
