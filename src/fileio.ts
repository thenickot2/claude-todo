import {
  readTextFile,
  writeTextFile,
  exists,
  mkdir,
  remove,
  readDir,
  watch,
} from "@tauri-apps/plugin-fs";
import type { UnwatchFn } from "@tauri-apps/plugin-fs";
import { appDataDir, homeDir, join } from "@tauri-apps/api/path";
import { TodoFile, SessionNotification } from "./types";
import { parseTodoFile, serializeTodoFile } from "./storage";
import { SIGNAL_DIR_NAME, parseSignalFile } from "./notifications";

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
  for (let i = 0; i < 10; i++) {
    try {
      await writeTextFile(lockPath, String(Date.now()), { createNew: true });
      return; // Lock acquired
    } catch {
      // Lock file exists — check if stale (>5 seconds old)
      try {
        const content = await readTextFile(lockPath);
        const lockTime = parseInt(content, 10);
        if (Date.now() - lockTime > 5000) {
          await remove(lockPath);
          continue;
        }
      } catch {
        // Lock was removed between our check, retry
        continue;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  // Force acquire after all retries exhausted (stale lock)
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
    // Migration is best-effort — old dir may not exist or may lack permissions
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
      } catch (e) {
        console.warn("Failed to reload todos after file change:", e);
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

// --- Signal file I/O for Claude Code notifications ---

let signalDirPath: string | null = null;

async function getSignalDir(): Promise<string> {
  if (signalDirPath) return signalDirPath;
  const base = await appDataDir();
  signalDirPath = await join(base, SIGNAL_DIR_NAME);
  return signalDirPath;
}

async function ensureSignalDir(): Promise<string> {
  const dir = await getSignalDir();
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

async function scanSignalDir(): Promise<SessionNotification[]> {
  const dir = await getSignalDir();
  if (!(await exists(dir))) return [];

  const entries = await readDir(dir);
  const signals: SessionNotification[] = [];

  for (const entry of entries) {
    if (!entry.name || !entry.name.endsWith(".json")) continue;
    try {
      const filePath = await join(dir, entry.name);
      const content = await readTextFile(filePath);
      const signal = parseSignalFile(entry.name, content);
      if (signal) signals.push(signal);
    } catch {
      // File may have been removed between listing and reading
    }
  }

  return signals;
}

export async function watchSignals(
  onChange: (signals: SessionNotification[]) => void,
): Promise<UnwatchFn> {
  const dir = await ensureSignalDir();

  // Initial scan
  const initial = await scanSignalDir();
  onChange(initial);

  return watch(dir, async (event) => {
    // React to any file event in the signal directory
    const type = event.type;
    if (type && typeof type === "object" && ("create" in type || "modify" in type || "remove" in type)) {
      try {
        const signals = await scanSignalDir();
        onChange(signals);
      } catch (e) {
        console.warn("Failed to scan signal directory:", e);
      }
    }
  }, { delayMs: 500 });
}

export async function removeSignalFile(fileName: string): Promise<void> {
  try {
    const dir = await getSignalDir();
    const filePath = await join(dir, fileName);
    await remove(filePath);
  } catch {
    // File may already be gone
  }
}

export async function cleanupStaleSignals(maxAgeMs: number = 3600000): Promise<void> {
  const dir = await getSignalDir();
  if (!(await exists(dir))) return;

  const entries = await readDir(dir);
  const now = Date.now();

  for (const entry of entries) {
    if (!entry.name || !entry.name.endsWith(".json")) continue;
    try {
      const filePath = await join(dir, entry.name);
      const content = await readTextFile(filePath);
      // Try to extract a timestamp from the filename
      // Formats: sessionId-<nanoseconds>.json (Windows) or sessionId-<seconds><pid>.json (macOS)
      // We extract the leading digits after the last dash as seconds-precision
      const match = entry.name.match(/-(\d+)\.json$/);
      if (match) {
        const raw = parseInt(match[1], 10);
        // Normalize: nanoseconds (>1e15) → ms, seconds (10-digit) → ms, already ms otherwise
        let fileTimeMs: number;
        if (raw > 1e15) {
          fileTimeMs = raw / 1e6; // nanoseconds to ms
        } else if (raw < 1e12) {
          fileTimeMs = raw * 1000; // seconds to ms
        } else {
          fileTimeMs = raw; // already ms
        }
        if (now - fileTimeMs > maxAgeMs) {
          await remove(filePath);
          continue;
        }
      }
      // Fallback: if we can't determine age from filename, check if it's parseable
      // If it's not even valid JSON, remove it
      try {
        JSON.parse(content);
      } catch {
        await remove(filePath);
      }
    } catch {
      // Skip files we can't read
    }
  }
}
