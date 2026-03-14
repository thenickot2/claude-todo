import { useState, useEffect, useCallback } from "react";
import { TodoFile, TodoItem, TodoStatus } from "./types";
import { loadTodos, saveTodos, watchTodos } from "./fileio";
import { todayString } from "./storage";
import { launchSession, resumeSession, terminalTitle } from "./claude";
import { closeTerminalByTitle, focusTerminalByTitle } from "./windowmgmt";

function App() {
  const [todos, setTodos] = useState<TodoFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

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

  const save = async (updated: TodoFile) => {
    setTodos(updated);
    try {
      await saveTodos(updated);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const addTodo = async () => {
    if (!newTitle.trim() || !todos) return;
    const item: TodoItem = { title: newTitle.trim(), created: todayString() };
    await save({ ...todos, notStarted: [...todos.notStarted, item] });
    setNewTitle("");
  };

  const deleteTodo = async (status: TodoStatus, index: number) => {
    if (!todos) return;
    const updated = { ...todos };
    const list = [...getList(updated, status)];
    list.splice(index, 1);
    setList(updated, status, list);
    await save(updated);
  };

  const moveTodo = async (
    fromStatus: TodoStatus,
    index: number,
    toStatus: TodoStatus,
  ) => {
    if (!todos) return;
    const updated = { ...todos };
    const fromList = [...getList(updated, fromStatus)];
    const [item] = fromList.splice(index, 1);
    setList(updated, fromStatus, fromList);

    const movedItem = { ...item };
    if (toStatus === "in-progress" && !movedItem.started) {
      movedItem.started = todayString();
    }
    if (toStatus === "done" && !movedItem.completed) {
      movedItem.completed = todayString();
    }

    const toList = [...getList(updated, toStatus), movedItem];
    setList(updated, toStatus, toList);
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
    const updated = { ...todos };
    const list = [...getList(updated, status)];
    list[index] = { ...list[index], title: editTitle.trim() };
    setList(updated, status, list);
    await save(updated);
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
        await resumeSession(item.sessionId, () => {});
      } else {
        await launchSession(item.title, item.project, () => {});
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

  // Focus = bring terminal window to foreground
  const focusClaude = async (status: TodoStatus, index: number) => {
    if (!todos) return;
    const item = getList(todos, status)[index];
    try {
      await focusTerminalByTitle(terminalTitle(item.title));
    } catch {
      // Window not found
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
          addTodo();
        }}
      >
        <input
          type="text"
          placeholder="Add a new task..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>

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
        actions={[
          { label: "Focus", handler: focusClaude },
          { label: "Start", handler: startClaude, style: "accent" },
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
  actions: Action[];
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
          const key = `${status}-${i}`;
          const isEditing = editingKey === key;

          return (
            <li key={key} className={`todo-item${isDone ? " done" : ""}`}>
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
                  onDoubleClick={() => onStartEdit(key, item.title)}
                >
                  {item.title}
                  {item.project && (
                    <span className="todo-project">
                      {item.project.split("/").pop()}
                    </span>
                  )}
                </span>
              )}

              <div className="todo-actions">
                {actions.map((action) => (
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

function setList(file: TodoFile, status: TodoStatus, list: TodoItem[]) {
  switch (status) {
    case "not-started":
      file.notStarted = list;
      break;
    case "in-progress":
      file.inProgress = list;
      break;
    case "done":
      file.done = list;
      break;
  }
}

export default App;
