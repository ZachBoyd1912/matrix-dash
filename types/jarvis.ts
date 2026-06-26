export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  isEnabled: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  kind: string;
  href: string | null;
  isRead: boolean | null;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  isDone: boolean | null;
  dueAt: string | null;
  remindAt: string | null;
  reminded: boolean | null;
  priority: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledJob {
  id: string;
  name: string;
  prompt: string;
  cron: string;
  isEnabled: boolean | null;
  lastRunAt: string | null;
  lastResult: string | null;
  createdAt: string;
}

export interface EmailAccountPublic {
  id: string;
  label: string;
  address: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  useTls: boolean | null;
  triageEnabled: boolean | null;
  isActive: boolean | null;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface Calendar {
  id: string;
  name: string;
  color: string;
  caldavUrl: string | null;
  caldavUser: string | null;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  uid: string | null;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  notes: string;
  createdAt: string;
}

export interface ApiTokenPublic {
  id: string;
  label: string;
  token: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface VaultEntryPublic {
  id: string;
  label: string;
  createdAt: string;
}

export interface Webhook {
  id: string;
  label: string;
  url: string;
  event: string;
  isEnabled: boolean | null;
  createdAt: string;
}

export interface Preset {
  id: string;
  name: string;
  systemPrompt: string;
  createdAt: string;
}

export interface GeneratedImage {
  id: string;
  prompt: string;
  dataUrl: string;
  provider: string | null;
  createdAt: string;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
  state: "call" | "result" | "error";
}

export type KanbanStatus = "backlog" | "planned" | "in-progress" | "developed" | "tested" | "completed";

export interface Project {
  id: string;
  name: string;
  description: string;
  purpose: string;
  frontend: string | null;
  backend: string | null;
  database: string | null;
  badge: string;
  path: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanTask {
  id: string;
  title: string;
  notes: string;
  isDone: boolean | null;
  dueAt: string | null;
  remindAt: string | null;
  reminded: boolean | null;
  priority: string;
  kind: string;
  kanbanStatus: string;
  projectId: string | null;
  kanbanOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type TaskKind = "task" | "bug" | "error" | "feature";
