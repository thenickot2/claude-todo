import {
  readTextFile,
  writeTextFile,
  exists,
  mkdir,
  remove,
  watch,
} from "@tauri-apps/plugin-fs";
import type { UnwatchFn } from "@tauri-apps/plugin-fs";
import { appDataDir, homeDir, join } from "@tauri-apps/api/path";
import { TodoFile } from "./types";
import { parseTodoFile, serializeTodoFile } from "./storage";

const FILE_NAME = "todos.md";
const LOCK_NAME = "todos.md.lock";

async function getTodoDir(): Promise<string> {
  return await appDataDir();
}

async function getOldTodoDir(): Promise<string> {
  const home = await homeDir();
  return await join(home, ".claude-todo");
}

async function getTodoPath(): Promise<string> {
  const dir = await getTodoDir();
  return await join(dir, FILE_NAME);
}

async function getLockPath(): Promise<string> {
  const dir = await getTodoDir();
  return await join(dir, LOCK_NAME);
}

async function acquireLock(): Promise<void> {
  const lockPath = await getLockPath();
  // Simple lock: write a lock file, fail if it already exists
  // In practice, stale locks from crashes are handled by timeout
  for (let i = 0; i < 10; i++) {
    if (await exists(lockPath)) {
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }
    await writeTextFile(lockPath, String(Date.now()));
    return;
  }
  // Force acquire after timeout (stale lock)
  await writeTextFile(lockPath, String(Date.now()));
}

async function releaseLock(): Promise<void> {
  const lockPath = await getLockPath();
  try {
    await remove(lockPath);
  } catch {
    // Lock already gone, that's fine
  }
}

async function ensureDir(): Promise<void> {
  const dir = await getTodoDir();
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  // Migrate from old ~/.claude-todo location if it exists
  await migrateOldDir();
}

let migrationDone = false;
async function migrateOldDir(): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;
  try {
    const oldDir = await getOldTodoDir();
    const oldFile = await join(oldDir, FILE_NAME);
    if (!(await exists(oldFile))) return;

    const newDir = await getTodoDir();
    const newFile = await join(newDir, FILE_NAME);
    // Only migrate if the new location doesn't already have data
    if (!(await exists(newFile))) {
      const content = await readTextFile(oldFile);
      await writeTextFile(newFile, content);
    }
    // Clean up old directory
    await remove(oldDir, { recursive: true });
  } catch {
    // Migration is best-effort
  }
}

const DEFAULT_CONTENT = `# Claude Todo

## Not Started

## In Progress

## Done
`;

export async function loadTodos(): Promise<TodoFile> {
  await ensureDir();
  const path = await getTodoPath();

  if (!(await exists(path))) {
    await writeTextFile(path, DEFAULT_CONTENT);
    return parseTodoFile(DEFAULT_CONTENT);
  }

  const content = await readTextFile(path);
  return parseTodoFile(content);
}

export async function watchTodos(
  onChange: (file: TodoFile) => void,
): Promise<UnwatchFn> {
  await ensureDir();
  const path = await getTodoPath();

  // Ensure the file exists before watching
  if (!(await exists(path))) {
    const DEFAULT_CONTENT = `# Claude Todo\n\n## Not Started\n\n## In Progress\n\n## Done\n`;
    await writeTextFile(path, DEFAULT_CONTENT);
  }

  return watch(path, async (event) => {
    // Only reload on modify events, skip lock file changes
    if (event.type && typeof event.type === "object" && "modify" in event.type) {
      try {
        const content = await readTextFile(path);
        onChange(parseTodoFile(content));
      } catch {
        // File might be mid-write, ignore
      }
    }
  }, { delayMs: 500 });
}

export async function saveTodos(file: TodoFile): Promise<void> {
  await ensureDir();
  await acquireLock();
  try {
    const path = await getTodoPath();
    const content = serializeTodoFile(file);
    await writeTextFile(path, content);
  } finally {
    await releaseLock();
  }
}
