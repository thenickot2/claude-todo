import { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { TodoFile, TodoItem, TodoStatus, SessionNotification } from "./types";
import { loadTodos, saveTodos, watchTodos, watchSignals, removeSignalFile, cleanupStaleSignals } from "./fileio";
import { todayString } from "./storage";
import { notificationLabel } from "./notifications";
import { launchSession, resumeSession, terminalTitle } from "./claude";
import {
  closeTerminalByTitle,
  focusTerminalByTitle,
  findTerminalWindows,
} from "./windowmgmt";

function App() {
  const [todos, setTodos] = useState<TodoFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [runningTitles, setRunningTitles] = useState<Set<string>>(new Set());
  const [formExpanded, setFormExpanded] = useState(false);
  const [formDirectory, setFormDirectory] = useState("");
  const [formFlags, setFormFlags] = useState<string[]>([]);
  const [formExtraArgs, setFormExtraArgs] = useState("");
  const [notifications, setNotifications] = useState<Map<string, SessionNotification>>(new Map());

  const load = useCallback(async () => {
    try {
      const data = await loadTodos();
      setTodos(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    load();
    let unwatch: (() => void) | undefined;
    watchTodos((updated) => setTodos(updated)).then((fn) => {
      unwatch = fn;
    });
    return () => {
      unwatch?.();
    };
  }, [load]);

  useEffect(() => {
    const poll = async () => {
      try {
        const windows = await findTerminalWindows();
        setRunningTitles(new Set(windows.map((w) => w.title)));
      } catch {
        // Window enumeration might fail
      }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    cleanupStaleSignals().catch(() => {});
    let unwatch: (() => void) | undefined;
    watchSignals((signals) => {
      const map = new Map<string, SessionNotification>();
      for (const sig of signals) {
        const existing = map.get(sig.sessionId);
        if (!existing || sig.timestamp > existing.timestamp) {
          map.set(sig.sessionId, sig);
        }
      }
      setNotifications(map);
    }).then((fn) => { unwatch = fn; });
    return () => { unwatch?.(); };
  }, []);

  const getNotification = useCallback(
    (item: TodoItem): SessionNotification | undefined => {
      if (!item.sessionId) return undefined;
      return notifications.get(item.sessionId);
    },
    [notifications],
  );

  const isRunning = useCallback(
    (item: TodoItem): boolean => {
      const expected = terminalTitle(item.title);
      for (const title of runningTitles) {
        if (title.includes(expected)) return true;
      }
      return false;
    },
    [runningTitles],
  );

  const save = async (updated: TodoFile) => {
    const previous = todos;
    setTodos(updated);
    try {
      await saveTodos(updated);
      setError(null);
    } catch (e) {
      setTodos(previous);
      setError(String(e));
    }
  };

  const handleAddSubmit = () => {
    if (!newTitle.trim()) return;
    if (!formExpanded) {
      setFormExpanded(true);
      return;
    }
    createTodo();
  };

  const createTodo = async () => {
    if (!newTitle.trim() || !todos) return;
    const item: TodoItem = {
      id: crypto.randomUUID(),
      title: newTitle.trim(),
      created: todayString(),
    };
    if (formDirectory.trim()) {
      item.directory = formDirectory.trim();
    }
    if (formFlags.length > 0) {
      item.flags = [...formFlags];
    }
    if (formExtraArgs.trim()) {
      item.extraArgs = formExtraArgs.trim();
    }
    await save({ ...todos, notStarted: [...todos.notStarted, item] });
    resetForm();
  };

  const resetForm = () => {
    setNewTitle("");
    setFormExpanded(false);
    setFormDirectory("");
    setFormFlags([]);
    setFormExtraArgs("");
  };

  const browseDirectory = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        setFormDirectory(selected);
      }
    } catch {
      // User cancelled or dialog failed
    }
  };

  const toggleFlag = (flag: string) => {
    setFormFlags((prev) =>
      prev.includes(flag)
        ? prev.filter((f) => f !== flag)
        : [...prev, flag],
    );
  };

  const deleteTodo = async (status: TodoStatus, index: number) => {
    if (!todos) return;
    const list = [...getList(todos, status)];
    list.splice(index, 1);
    await save(withList(todos, status, list));
  };

  const moveTodo = async (
    fromStatus: TodoStatus,
    index: number,
    toStatus: TodoStatus,
  ) => {
    if (!todos) return;
    const fromList = [...getList(todos, fromStatus)];
    const [item] = fromList.splice(index, 1);
    let updated = withList(todos, fromStatus, fromList);

    const movedItem = { ...item };
    if (toStatus === "in-progress" && !movedItem.started) {
      movedItem.started = todayString();
    }
    if (toStatus === "done" && !movedItem.completed) {
      movedItem.completed = todayString();
    }

    const toList = [...getList(updated, toStatus), movedItem];
    updated = withList(updated, toStatus, toList);
    await save(updated);
  };

  const startEdit = (key: string, title: string) => {
    setEditingKey(key);
    setEditTitle(title);
  };

  const commitEdit = async (status: TodoStatus, index: number) => {
    if (!todos || !editTitle.trim()) {
      setEditingKey(null);
      return;
    }
    const list = [...getList(todos, status)];
    list[index] = { ...list[index], title: editTitle.trim() };
    await save(withList(todos, status, list));
    setEditingKey(null);
  };

  const closeTerminal = async (title: string) => {
    try {
      await closeTerminalByTitle(terminalTitle(title));
    } catch {
      // Window might already be closed
    }
  };

  const launchClaude = async (item: TodoItem) => {
    try {
      if (item.sessionId) {
        await resumeSession(item.sessionId);
      } else {
        const dir = item.directory || item.project;
        await launchSession(item.title, dir, item.flags, item.extraArgs);
      }
    } catch (e) {
      setError(`Failed to launch Claude: ${e}`);
    }
  };

  // Start = move to in-progress + open Claude terminal
  const startClaude = async (status: TodoStatus, index: number) => {
    if (!todos) return;
    const item = getList(todos, status)[index];
    if (status !== "in-progress") {
      await moveTodo(status, index, "in-progress");
    }
    await launchClaude(item);
  };

  // Stop = close terminal + move back to not-started (pause)
  const stopClaude = async (status: TodoStatus, index: number) => {
    if (!todos) return;
    const item = getList(todos, status)[index];
    await closeTerminal(item.title);
    await moveTodo(status, index, "not-started");
  };

  // Done = close terminal + move to done
  const doneClaude = async (status: TodoStatus, index: number) => {
    if (!todos) return;
    const item = getList(todos, status)[index];
    await closeTerminal(item.title);
    await moveTodo(status, index, "done");
  };

  // Focus = bring terminal window to foreground + clear notification
  const focusClaude = async (status: TodoStatus, index: number) => {
    if (!todos) return;
    const item = getList(todos, status)[index];
    try {
      await focusTerminalByTitle(terminalTitle(item.title));
    } catch {
      // Window not found
    }
    const notif = getNotification(item);
    if (notif) {
      removeSignalFile(notif.fileName).catch(() => {});
    }
  };

  if (!todos) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="app">
      {error && <div className="error-banner">{error}</div>}

      <div className="app-header">
        <h1>Claude Todo</h1>
      </div>

      <form
        className="add-form"
        onSubmit={(e) => {
          e.preventDefault();
          handleAddSubmit();
        }}
      >
        <input
          type="text"
          placeholder="Add a new task..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && formExpanded) {
              resetForm();
            }
          }}
        />
        {!formExpanded && (
          <button type="submit" disabled={!newTitle.trim()}>
            Add
          </button>
        )}
      </form>

      {formExpanded && (
        <div className="add-form-expanded">
          <div className="form-row">
            <label>Directory</label>
            <input
              type="text"
              placeholder="Project directory (optional)"
              value={formDirectory}
              onChange={(e) => setFormDirectory(e.target.value)}
            />
            <button
              type="button"
              className="btn-sm"
              onClick={browseDirectory}
            >
              Browse
            </button>
          </div>

          <div className="form-row">
            <label>Flags</label>
            <div className="flag-toggles">
              <button
                type="button"
                className={`flag-toggle${formFlags.includes("--dangerously-skip-permissions") ? " active" : ""}`}
                onClick={() =>
                  toggleFlag("--dangerously-skip-permissions")
                }
              >
                Skip Permissions
              </button>
            </div>
          </div>

          <div className="form-row">
            <label>Extra args</label>
            <input
              type="text"
              placeholder="Additional CLI arguments (optional)"
              value={formExtraArgs}
              onChange={(e) => setFormExtraArgs(e.target.value)}
            />
          </div>

          <div className="add-form-actions">
            <button
              type="button"
              className="btn-cancel"
              onClick={resetForm}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-create"
              onClick={createTodo}
            >
              Create
            </button>
          </div>
        </div>
      )}

      <Section
        label="Not Started"
        items={todos.notStarted}
        status="not-started"
        editingKey={editingKey}
        editTitle={editTitle}
        onEditTitle={setEditTitle}
        onStartEdit={startEdit}
        onCommitEdit={commitEdit}
        onDelete={deleteTodo}
        isRunning={isRunning}
        getNotification={getNotification}
        actions={[
          { label: "Start", handler: startClaude, style: "accent" },
          { label: "Done", handler: (s, i) => moveTodo(s, i, "done") },
        ]}
      />

      <Section
        label="In Progress"
        items={todos.inProgress}
        status="in-progress"
        editingKey={editingKey}
        editTitle={editTitle}
        onEditTitle={setEditTitle}
        onStartEdit={startEdit}
        onCommitEdit={commitEdit}
        onDelete={deleteTodo}
        isRunning={isRunning}
        getNotification={getNotification}
        actions={(item) => [
          ...(isRunning(item)
            ? [{ label: "Focus", handler: focusClaude }]
            : [{ label: "Start", handler: startClaude, style: "accent" as const }]),
          { label: "Stop", handler: stopClaude },
          { label: "Done", handler: doneClaude },
        ]}
      />

      <Section
        label="Done"
        items={todos.done}
        status="done"
        editingKey={editingKey}
        editTitle={editTitle}
        onEditTitle={setEditTitle}
        onStartEdit={startEdit}
        onCommitEdit={commitEdit}
        onDelete={deleteTodo}
        isRunning={isRunning}
        getNotification={getNotification}
        actions={[
          { label: "Reopen", handler: (s, i) => moveTodo(s, i, "not-started") },
        ]}
      />
    </div>
  );
}

interface Action {
  label: string;
  handler: (status: TodoStatus, index: number) => void;
  style?: "accent" | "danger";
}

interface SectionProps {
  label: string;
  items: TodoItem[];
  status: TodoStatus;
  editingKey: string | null;
  editTitle: string;
  onEditTitle: (v: string) => void;
  onStartEdit: (key: string, title: string) => void;
  onCommitEdit: (status: TodoStatus, index: number) => void;
  onDelete: (status: TodoStatus, index: number) => void;
  isRunning: (item: TodoItem) => boolean;
  getNotification: (item: TodoItem) => SessionNotification | undefined;
  actions: Action[] | ((item: TodoItem) => Action[]);
}

function flagLabel(flag: string): string {
  const labels: Record<string, string> = {
    "--dangerously-skip-permissions": "skip-perms",
    "--verbose": "verbose",
  };
  return labels[flag] || flag.replace(/^--/, "");
}

function Section({
  label,
  items,
  status,
  editingKey,
  editTitle,
  onEditTitle,
  onStartEdit,
  onCommitEdit,
  onDelete,
  isRunning,
  getNotification,
  actions,
}: SectionProps) {
  const isDone = status === "done";

  return (
    <div className="section">
      <div className="section-header">
        {label}{" "}
        <span className="section-count">({items.length})</span>
      </div>
      <ul className="todo-list">
        {items.map((item, i) => {
          const isEditing = editingKey === item.id;
          const running = isRunning(item);
          const notification = getNotification(item);
          const itemActions =
            typeof actions === "function" ? actions(item) : actions;

          return (
            <li
              key={item.id}
              className={`todo-item${isDone ? " done" : ""}${running ? " running" : ""}${notification ? ` has-notification ${notification.type}` : ""}`}
            >
              {notification ? (
                <span
                  className={`status-dot notification ${notification.type}`}
                  title={notificationLabel(notification.type)}
                />
              ) : running ? (
                <span className="status-dot running" />
              ) : null}

              {isEditing ? (
                <input
                  className="todo-title-input"
                  value={editTitle}
                  onChange={(e) => onEditTitle(e.target.value)}
                  onBlur={() => onCommitEdit(status, i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onCommitEdit(status, i);
                    if (e.key === "Escape") onStartEdit("", "");
                  }}
                  autoFocus
                />
              ) : (
                <span
                  className={`todo-title${isDone ? " done" : ""}`}
                  onDoubleClick={() => onStartEdit(item.id, item.title)}
                >
                  {item.title}
                  {(item.directory || item.project) && (
                    <span className="todo-directory">
                      {(item.directory || item.project || "")
                        .split(/[/\\]/)
                        .pop()}
                    </span>
                  )}
                  {item.flags &&
                    item.flags.length > 0 &&
                    item.flags.map((flag) => (
                      <span key={flag} className="flag-pill">
                        {flagLabel(flag)}
                      </span>
                    ))}
                  {item.extraArgs && (
                    <span className="todo-extra-args">{item.extraArgs}</span>
                  )}
                </span>
              )}

              <div className="todo-actions">
                {itemActions.map((action) => (
                  <button
                    key={action.label}
                    className={`btn-sm${action.style ? ` ${action.style}` : ""}`}
                    onClick={() => action.handler(status, i)}
                  >
                    {action.label}
                  </button>
                ))}
                <button
                  className="btn-sm danger"
                  onClick={() => onDelete(status, i)}
                >
                  Del
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function getList(file: TodoFile, status: TodoStatus): TodoItem[] {
  switch (status) {
    case "not-started":
      return file.notStarted;
    case "in-progress":
      return file.inProgress;
    case "done":
      return file.done;
  }
}

function withList(file: TodoFile, status: TodoStatus, list: TodoItem[]): TodoFile {
  switch (status) {
    case "not-started":
      return { ...file, notStarted: list };
    case "in-progress":
      return { ...file, inProgress: list };
    case "done":
      return { ...file, done: list };
  }
}

export default App;
