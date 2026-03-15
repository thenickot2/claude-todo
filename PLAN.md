# Claude Todo — Implementation Plan

A native to-do list app that tracks and controls Claude Code terminal sessions.
Markdown files for persistent storage. Windows first, then macOS.

See [FEASIBILITY.md](./FEASIBILITY.md) for research and architecture details.

---

## Storage Layer

All state lives in a single markdown file per workspace (e.g. `~/.claude-todo/todos.md`).
The app reads/writes this file directly — no database, no server.

### Todo File Format

```markdown
# Claude Todo

## Not Started
- [ ] Refactor auth module | project:/Users/nick/myapp | created:2026-03-14
- [ ] Write integration tests | project:/Users/nick/myapp | created:2026-03-13

## In Progress
- [ ] Fix login bug | project:/Users/nick/myapp | session:abc123 | started:2026-03-14
- [ ] Add caching layer | project:/Users/nick/api | session:def456 | started:2026-03-13

## Done
- [x] Set up CI pipeline | project:/Users/nick/myapp | session:ghi789 | completed:2026-03-12
```

### Storage Rules

- One global todo file at `~/.claude-todo/todos.md`
- Items move between sections as status changes
- Session IDs are attached when a Claude Code session is launched for that item
- Metadata is pipe-delimited after the item title for easy parsing
- The file is human-readable and hand-editable
- File read/write uses simple string parsing — no markdown AST library needed
- Write lock: read-modify-write with a `.lock` file to prevent corruption from concurrent access

---

## Progress Tracker

### Phase 0 — Project Setup
- [x] Initialize Tauri 2.0 project (Rust + TypeScript)
- [x] Set up frontend framework (React + TypeScript)
- [x] Configure build scripts for Windows
- [x] Set up dev tooling (linting, formatting)
- [x] Create initial project structure
- [x] Install MSVC Build Tools with C++ toolset (required for Rust linker on Windows)
- [x] Verify full Tauri build (`npm run tauri dev`)

### Phase 1 — Storage Layer
- [x] Define TypeScript types for todo items (`TodoItem`, `TodoStatus`, `TodoFile`)
- [x] Implement markdown parser (read `todos.md` → structured data)
- [x] Implement markdown serializer (structured data → `todos.md`)
- [x] Implement file read/write with `.lock` file
- [x] Add default file creation on first run (`~/.claude-todo/todos.md`)
- [x] Unit tests for parser and serializer (round-trip)

### Phase 2 — Core UI
- [x] Todo list view — three sections: Not Started, In Progress, Done
- [x] Create new todo item (title + optional project path)
- [x] Move items between statuses (drag or button)
- [x] Edit todo item title
- [x] Delete todo item
- [x] Persist all changes back to markdown file
- [x] Auto-reload when file changes on disk (file watcher)

### Phase 3 — Claude Code Integration (Windows)
- [x] Launch Claude Code session for a todo item (`claude --name "todo-title"`)
- [x] Attach session ID to todo item metadata
- [x] Track session status via `--output-format stream-json`
- [x] Resume a paused session (`claude --resume`)
- [x] Mark todo as done when session completes

### Phase 4 — Window Management (Windows)
- [x] Discover Claude Code terminal windows (`EnumWindows` + `GetWindowText`)
- [x] Focus/switch to a session's terminal window (`SetForegroundWindow`)
- [x] Windows Terminal tab control via `wt.exe` CLI (scoped command configured)
- [x] Map running `claude` processes to todo items via session ID

### Phase 5 — macOS Support
- [x] Build macOS Tauri target
- [x] macOS window discovery (AppleScript via `osascript` — lists Terminal.app & iTerm2 windows)
- [x] iTerm2 adapter (AppleScript — window creation, focus, close)
- [x] Terminal.app adapter (AppleScript — window creation, focus, close)
- [x] macOS permissions flow (`check_accessibility_permission` command; macOS auto-prompts on first use)

### Phase 6 — Polish & Ship
- [ ] Keyboard shortcuts for rapid context switching
- [ ] System tray / menu bar presence
- [ ] Error handling and user-facing error messages
- [ ] First-run onboarding (create default todo file, explain usage)
- [ ] Package and distribute (Windows installer, macOS .dmg)
- [ ] README and user documentation

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Tauri 2.0 |
| Backend | Rust |
| Frontend | React + TypeScript |
| Storage | Markdown file (`~/.claude-todo/todos.md`) |
| Window mgmt (Win) | `windows-rs` crate (`EnumWindows`, `SetForegroundWindow`) |
| Window mgmt (Mac) | AppleScript via `osascript` (Terminal.app + iTerm2) |
| Claude integration | Claude Code CLI (`--name`, `--resume`, `stream-json`) |

## Development Order

1. **Windows first** — primary dev machine, no permission hurdles
2. **macOS second** — requires Accessibility permissions, separate adapters
3. **Storage and UI before platform integration** — get the app working as a standalone todo list first, then layer on Claude Code session management

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Markdown file storage | Human-readable, hand-editable, zero dependencies, works everywhere |
| Single global todo file | Simplest model; can add per-project files later if needed |
| Pipe-delimited metadata | Easy to parse, doesn't break markdown rendering |
| Owned sessions (app launches them) | Avoids hard discovery/adoption problems; full lifecycle control |
| Windows first | Dev machine is Windows; no permission complexity to slow iteration |
