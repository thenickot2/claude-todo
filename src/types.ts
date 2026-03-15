export type TodoStatus = "not-started" | "in-progress" | "done";

export interface TodoItem {
  id: string;
  title: string;
  project?: string;
  directory?: string;
  flags?: string[];
  extraArgs?: string;
  sessionId?: string;
  created?: string;
  started?: string;
  completed?: string;
}

export interface TodoFile {
  notStarted: TodoItem[];
  inProgress: TodoItem[];
  done: TodoItem[];
}

export type NotificationType = "idle_prompt" | "permission_prompt" | "elicitation_dialog";

export interface SessionNotification {
  sessionId: string;
  type: NotificationType;
  fileName: string;
  timestamp: number;
}
