export type TodoStatus = "not-started" | "in-progress" | "done";

export interface TodoItem {
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
