# Claude Todo

A lightweight desktop app for managing [Claude Code](https://docs.anthropic.com/en/docs/claude-code) terminal sessions. Think of it as a simple todo list that can launch, focus, pause, and close Claude Code terminals on your behalf.

![Claude Todo screenshot](docs/screenshot.png)

## Why

If you work with Claude Code across multiple projects or tasks, you've probably ended up with a mess of terminal tabs, each running a different session, with no easy way to see what's active, resume something you paused, or keep track of what's done.

You could self-manage tabs, try different terminal multiplexers, or reach for a full project management tool -- but those are either too low-level or too heavy for the problem. What's missing is a thin management layer between your todo list and your terminals.

Claude Todo fills that gap. Your tasks are stored as a plain markdown file. The app reads it, lets you manage tasks through a clean UI, and handles the terminal lifecycle for each one. No accounts, no sync, no complexity -- just a `.md` file and a native window.

## Features

- **Task management** -- Create, edit, reorder, and delete tasks across Not Started / In Progress / Done columns
- **Terminal lifecycle** -- Start a Claude Code session for any task, focus its window, pause it, or mark it done (which closes the terminal)
- **Running session detection** -- See which tasks have an active terminal with a live status indicator
- **Session resume** -- Resume a previous Claude Code session by its session ID
- **Per-task configuration** -- Set a working directory, CLI flags (e.g. `--dangerously-skip-permissions`), and extra arguments per task
- **Plain markdown storage** -- All data lives in a single `todos.md` file in your app data directory, human-readable and version-controllable
- **File watcher** -- External edits to `todos.md` are picked up automatically
- **Cross-platform** -- Windows (Windows Terminal) and macOS (iTerm2 / Terminal.app)
- **Idle session alerts** -- Optional integration with Claude Code hooks to show when a session is waiting for input, needs permission, or is asking a question (see [Session Notifications](#session-notifications-optional) below)

## Install

Download the latest installer from the [Releases](https://github.com/thenickot2/claude-todo/releases) page:

| Platform | Download |
|----------|----------|
| Windows  | `.msi` installer |
| macOS    | `.dmg` disk image |

## Build from Source

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (stable toolchain)
- Platform-specific dependencies:
  - **Windows**: MSVC Build Tools (`stable-x86_64-pc-windows-msvc` toolchain)
  - **macOS**: Xcode Command Line Tools

### Setup

```bash
git clone https://github.com/thenickot2/claude-todo.git
cd claude-todo
npm install
```

### Development

```bash
# macOS
npm run tauri dev

# Windows (Git Bash) — MSVC linker must be on PATH
MSVC_BIN="/c/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64"
PATH="$MSVC_BIN:$PATH" npm run tauri dev
```

> **Note for Windows:** Git Bash ships its own `/usr/bin/link` which shadows the MSVC linker. The `PATH` prefix ensures the correct `link.exe` is found. Adjust the MSVC version path to match your installation.

### Production build

```bash
# macOS
npx tauri build

# Windows (Git Bash)
MSVC_BIN="/c/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64"
PATH="$MSVC_BIN:$PATH" npx tauri build
```

### Tests

```bash
# Unit tests (TypeScript, no Tauri runtime needed)
npx vitest run

# Type-check
npx tsc --noEmit
```

## How It Works

Tasks are stored in a markdown file at your OS app data directory (`%APPDATA%/com.claude-todo.app/todos.md` on Windows, `~/Library/Application Support/com.claude-todo.app/todos.md` on macOS). The format is straightforward:

```markdown
# Claude Todo

## Not Started
- [ ] Refactor auth module | id:abc-123 | directory:/projects/myapp | created:2025-03-14

## In Progress
- [ ] Fix login bug | id:def-456 | directory:/projects/myapp | session:s1 | started:2025-03-14

## Done
- [x] Set up CI pipeline | id:ghi-789 | completed:2025-03-12
```

When you click **Start** on a task, the app opens a new terminal tab running `claude --name "task title"` with whatever directory, flags, and extra args you configured. The task moves to In Progress and the app polls for its terminal window so it can show a live status dot.

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Backend**: Rust, [Tauri 2.0](https://v2.tauri.app/)
- **Window management**: Win32 API (Windows), AppleScript (macOS)
- **Storage**: Plain markdown, no database

## Session Notifications (Optional)

Claude Todo can show live status indicators when a Claude Code session is idle, needs permission, or is asking a question. This works through Claude Code's [hooks system](https://docs.anthropic.com/en/docs/claude-code/hooks) -- a hook writes a small JSON signal file that the app watches.

### How it works

1. You configure a Notification hook in your Claude Code settings
2. When Claude Code goes idle or needs your attention, the hook writes a signal file to the app's data directory
3. Claude Todo detects the file and shows a pulsing status dot on the matching task
4. When you click **Focus** to bring up the terminal, the notification clears automatically

### Setup

**Step 1: Create the hook script**

Save the following two scripts to `~/.claude/hooks/`.

**`notify-todo.sh`** — writes a signal file when Claude needs attention:

<details>
<summary><strong>Windows</strong> (Git Bash / MSYS2)</summary>

```bash
#!/bin/bash
# Claude Code hook: write notification signals for Claude Todo
SIGNAL_DIR="$APPDATA/com.claude-todo.app/idle-signals"
mkdir -p "$SIGNAL_DIR"
INPUT=$(cat -)
SESSION_ID=$(echo "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$SESSION_ID" ]; then
  echo "$INPUT" > "$SIGNAL_DIR/${SESSION_ID}-$(date +%s%N).json"
fi
```

</details>

<details>
<summary><strong>macOS</strong></summary>

```bash
#!/bin/bash
# Claude Code hook: write notification signals for Claude Todo
SIGNAL_DIR="$HOME/Library/Application Support/com.claude-todo.app/idle-signals"
mkdir -p "$SIGNAL_DIR"
INPUT=$(cat -)
SESSION_ID=$(echo "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$SESSION_ID" ]; then
  # macOS date doesn't support %N — use seconds + PID for uniqueness
  echo "$INPUT" > "$SIGNAL_DIR/${SESSION_ID}-$(date +%s)$$.json"
fi
```

</details>

**`clear-todo.sh`** — removes signal files when the user sends a new prompt (Claude is working again):

<details>
<summary><strong>Windows</strong> (Git Bash / MSYS2)</summary>

```bash
#!/bin/bash
# Claude Code hook: clear notification signals when user resumes interaction
SIGNAL_DIR="$APPDATA/com.claude-todo.app/idle-signals"
INPUT=$(cat -)
SESSION_ID=$(echo "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$SESSION_ID" ]; then
  rm -f "$SIGNAL_DIR/${SESSION_ID}"-*.json 2>/dev/null
fi
```

</details>

<details>
<summary><strong>macOS</strong></summary>

```bash
#!/bin/bash
# Claude Code hook: clear notification signals when user resumes interaction
SIGNAL_DIR="$HOME/Library/Application Support/com.claude-todo.app/idle-signals"
INPUT=$(cat -)
SESSION_ID=$(echo "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$SESSION_ID" ]; then
  rm -f "$SIGNAL_DIR/${SESSION_ID}"-*.json 2>/dev/null
fi
```

</details>

Make both scripts executable:
```bash
chmod +x ~/.claude/hooks/notify-todo.sh ~/.claude/hooks/clear-todo.sh
```

**Step 2: Add the hooks to your Claude Code settings**

Edit `~/.claude/settings.json` and add the following. If you already have other settings in the file, merge the `hooks` key into your existing config.

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/notify-todo.sh"
          }
        ]
      },
      {
        "matcher": "permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/notify-todo.sh"
          }
        ]
      },
      {
        "matcher": "elicitation_dialog",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/notify-todo.sh"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/hooks/clear-todo.sh"
          }
        ]
      }
    ]
  }
}
```

> **Windows note:** Claude Code on Windows runs hooks through Git Bash, so the `bash` prefix and `~/` paths work as-is. `$APPDATA` is set automatically by Windows.

> **macOS note:** The settings file is at `~/.claude/settings.json` (same path). The app data directory is `~/Library/Application Support/com.claude-todo.app/`.

### Lifecycle

1. A task is running — green pulsing dot (terminal detected)
2. Claude goes idle / needs permission / asks a question — the `Notification` hook writes a signal file — the dot changes to amber / red / blue
3. The notification clears automatically when **either**:
   - The user sends a new prompt in the terminal — the `UserPromptSubmit` hook deletes the signal files
   - The user clicks **Focus** in the app — the app deletes the signal file after bringing up the terminal
4. Back to green running dot

### Notification types

| Type | Indicator | Meaning |
|------|-----------|---------|
| `idle_prompt` | Amber pulsing dot | Claude finished and is waiting for your next prompt |
| `permission_prompt` | Red pulsing dot | Claude needs you to approve a tool use |
| `elicitation_dialog` | Blue pulsing dot | Claude is asking you a question |

### Troubleshooting

- **No notifications appearing?** Make sure the hook script is executable and that `session_id` in your signal files matches the session ID stored on your task (visible in `todos.md`).
- **Stale notifications?** The app automatically cleans up signal files older than 1 hour on startup.
- **Test the hook manually:**
  - **Windows:** `echo '{"session_id":"test","notification":{"type":"idle_prompt"}}' | bash ~/.claude/hooks/notify-todo.sh` — check `%APPDATA%/com.claude-todo.app/idle-signals/` for a `.json` file.
  - **macOS:** `echo '{"session_id":"test","notification":{"type":"idle_prompt"}}' | bash ~/.claude/hooks/notify-todo.sh` — check `~/Library/Application Support/com.claude-todo.app/idle-signals/` for a `.json` file.

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

```bash
# Run tests before submitting a PR
npx vitest run
npx tsc --noEmit
```

## License

[MIT](LICENSE)
