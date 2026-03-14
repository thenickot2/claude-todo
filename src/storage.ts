import { TodoItem, TodoFile, TodoStatus } from "./types";

const SECTION_HEADERS: Record<string, TodoStatus> = {
  "## Not Started": "not-started",
  "## In Progress": "in-progress",
  "## Done": "done",
};

const STATUS_HEADERS: Record<TodoStatus, string> = {
  "not-started": "## Not Started",
  "in-progress": "## In Progress",
  done: "## Done",
};

function parseItem(line: string): TodoItem | null {
  // Match: - [ ] Title | key:value | key:value ...
  // or:    - [x] Title | key:value | key:value ...
  const match = line.match(/^- \[[ x]\] (.+)$/);
  if (!match) return null;

  const parts = match[1].split(" | ");
  const title = parts[0].trim();
  const item: TodoItem = { title };

  for (let i = 1; i < parts.length; i++) {
    const [key, ...rest] = parts[i].split(":");
    const value = rest.join(":").trim();
    switch (key.trim()) {
      case "project":
        item.project = value;
        break;
      case "session":
        item.sessionId = value;
        break;
      case "directory":
        item.directory = value;
        break;
      case "flags":
        item.flags = value.split(",").map(f => f.trim()).filter(Boolean);
        break;
      case "extraArgs":
        item.extraArgs = value;
        break;
      case "created":
        item.created = value;
        break;
      case "started":
        item.started = value;
        break;
      case "completed":
        item.completed = value;
        break;
    }
  }

  return item;
}

function serializeItem(item: TodoItem, done: boolean): string {
  const check = done ? "x" : " ";
  let line = `- [${check}] ${item.title}`;
  if (item.project) line += ` | project:${item.project}`;
  if (item.directory) line += ` | directory:${item.directory}`;
  if (item.flags && item.flags.length > 0) line += ` | flags:${item.flags.join(",")}`;
  if (item.extraArgs) line += ` | extraArgs:${item.extraArgs}`;
  if (item.sessionId) line += ` | session:${item.sessionId}`;
  if (item.created) line += ` | created:${item.created}`;
  if (item.started) line += ` | started:${item.started}`;
  if (item.completed) line += ` | completed:${item.completed}`;
  return line;
}

export function parseTodoFile(content: string): TodoFile {
  const result: TodoFile = { notStarted: [], inProgress: [], done: [] };
  let currentStatus: TodoStatus | null = null;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (trimmed in SECTION_HEADERS) {
      currentStatus = SECTION_HEADERS[trimmed];
      continue;
    }

    if (!currentStatus || !trimmed.startsWith("- [")) continue;

    const item = parseItem(trimmed);
    if (!item) continue;

    switch (currentStatus) {
      case "not-started":
        result.notStarted.push(item);
        break;
      case "in-progress":
        result.inProgress.push(item);
        break;
      case "done":
        result.done.push(item);
        break;
    }
  }

  return result;
}

export function serializeTodoFile(file: TodoFile): string {
  const lines: string[] = ["# Claude Todo", ""];

  lines.push(STATUS_HEADERS["not-started"]);
  for (const item of file.notStarted) {
    lines.push(serializeItem(item, false));
  }
  lines.push("");

  lines.push(STATUS_HEADERS["in-progress"]);
  for (const item of file.inProgress) {
    lines.push(serializeItem(item, false));
  }
  lines.push("");

  lines.push(STATUS_HEADERS["done"]);
  for (const item of file.done) {
    lines.push(serializeItem(item, true));
  }
  lines.push("");

  return lines.join("\n");
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}
