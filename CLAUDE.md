# Claude Todo — Developer Guide

A Tauri 2.0 desktop app for managing todo items tied to Claude Code sessions.

## Build & Run

```bash
# Dev (from Git Bash on Windows — MSVC link.exe must be on PATH)
MSVC_BIN="/c/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64"
PATH="$MSVC_BIN:$PATH" npm run tauri dev

# Production build (same PATH prefix)
PATH="$MSVC_BIN:$PATH" npx tauri build

# Tests (pure TypeScript, no Tauri needed)
npx vitest run

# Type-check
npx tsc --noEmit
```

Toolchain: `stable-x86_64-pc-windows-msvc`. The MSVC PATH prefix is required because Git Bash's `/usr/bin/link` shadows the MSVC linker.

## Architecture

```
src/                          # Frontend (React + TypeScript)
├── main.tsx                  # React entry point
├── App.tsx                   # Root component — all UI state, CRUD handlers, session management
├── types.ts                  # TodoItem, TodoStatus, TodoFile type definitions
├── storage.ts                # Markdown parser/serializer (pure functions, no I/O)
├── storage.test.ts           # Vitest unit tests for parser/serializer round-trips
├── fileio.ts                 # Tauri FS plugin wrapper — load/save/watch todos.md
├── claude.ts                 # Claude Code CLI integration — launch/resume sessions
├── windowmgmt.ts             # TypeScript bindings for Rust window management commands
├── styles.css                # All styles, dark mode via prefers-color-scheme
└── vite-env.d.ts             # Vite type declarations

src-tauri/                    # Backend (Rust)
├── src/
│   ├── main.rs               # Binary entry point (calls lib::run)
│   ├── lib.rs                 # Tauri builder — registers plugins + commands
│   └── winmgmt.rs            # Windows-only: EnumWindows/SetForegroundWindow via windows-rs
├── capabilities/default.json  # Tauri permission scopes (fs, shell, dialog, watch)
├── tauri.conf.json            # App config, shell command scopes (claude, wt)
└── Cargo.toml                 # Rust dependencies
```

## Data Flow

```
todos.md ←→ fileio.ts (read/write) ←→ storage.ts (parse/serialize) ←→ App.tsx (state) → UI
                                                                          ↓
                                                                    claude.ts (sessions)
                                                                    windowmgmt.ts (focus)
```

- **Storage**: Single markdown file at `%APPDATA%/com.claude-todo.app/todos.md` (Tauri's `appDataDir()`). Three sections (`## Not Started`, `## In Progress`, `## Done`). Metadata is pipe-delimited: `- [ ] Title | key:value | key:value`. Supported keys: `project`, `directory`, `flags` (comma-separated), `extraArgs`, `session`, `created`, `started`, `completed`.
- **File watcher**: `fileio.ts` uses Tauri's `watch()` to detect external edits and reload.
- **Lock file**: `todos.md.lock` prevents concurrent write corruption during save.
- **Migration**: On first load, `fileio.ts` migrates data from the old `~/.claude-todo/` location to `appDataDir()` and cleans up the old directory.

## Key Patterns

### Adding a new Tauri command
1. Write the Rust function in `src-tauri/src/lib.rs` (or a new module)
2. Annotate with `#[tauri::command]`
3. Register in `generate_handler![]` in `lib.rs`
4. Call from TypeScript via `invoke<ReturnType>("command_name", { args })`

### Adding a new todo metadata field
1. Add the field to `TodoItem` in `src/types.ts`
2. Add the `case` in `parseItem()` and the line in `serializeItem()` in `src/storage.ts`
3. Add round-trip coverage in `src/storage.test.ts`

### Tauri plugin permissions
Scoped in `src-tauri/capabilities/default.json`. Each fs/shell operation needs an explicit permission entry with allowed paths. FS paths use `$APPDATA` for the data directory. Shell commands (claude, wt) are scoped in `tauri.conf.json` under `plugins.shell.scope`. The `dialog:default` permission enables native folder picker dialogs.

## Conventions

- **No component files** — `App.tsx` contains all components. Extract only when a component exceeds ~100 lines or is reused across files.
- **Pure logic in `storage.ts`** — no imports from Tauri. This keeps it testable without mocking.
- **I/O in `fileio.ts`** — all Tauri FS calls go here. Components never call Tauri FS directly.
- **Platform code** — Windows-specific Rust code in `winmgmt.rs` behind `#[cfg(target_os = "windows")]`. macOS code will go in a `macmgmt.rs` equivalent. `lib.rs` commands use `cfg` blocks to dispatch.
- **CSS** — single `styles.css` file, warm Notion-inspired palette with CSS custom properties (`--fg-primary`, `--bg-surface`, etc.), system font stack, 8px spacing grid, 3px border radius. Class naming is flat (`.todo-item`, `.btn-sm`). Dark mode via `prefers-color-scheme`.
- **Tests** — vitest for TypeScript. Test files live next to source (`storage.test.ts`). Run with `npx vitest run`. See [TESTING.md](TESTING.md) for full testing conventions (Rust, Tauri mocking, what to test vs skip).

## Current State

Phases 0–4 complete (setup, storage, UI, Claude integration, Windows window management). UI polish pass done: warm palette, progressive-disclosure task creation form (directory picker, flag toggles, extra args), running-window detection with status dots, enhanced item display with metadata badges. Data stored in `appDataDir()`. See `PLAN.md` for full progress tracker. Remaining: Phase 5 (macOS), Phase 6 (ship).
