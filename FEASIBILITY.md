# Claude Todo — Feasibility Research

A native to-do list app that tracks and controls Claude Code terminal sessions across macOS and Windows.

## Problem Statement

When running multiple Claude Code sessions across terminal tabs/windows, there's no centralized way to:
- See all active sessions at a glance
- Context-switch between them efficiently
- Relate each session back to a task or goal

## Feasibility Verdict

**Highly feasible.** Platform APIs exist on both macOS and Windows to discover, track, and control terminal windows. Claude Code's CLI and SDK already provide strong primitives for programmatic session management.

---

## Platform APIs

### macOS

| API | Capability | Permission Required |
|-----|-----------|---------------------|
| **Accessibility API** (`AXUIElement`) | Enumerate windows, read titles, switch focus, inspect tabs | Accessibility permission |
| **AppleScript / JXA** | Deep control of iTerm2 & Terminal.app — create/select tabs, run commands | None (app-level) |
| **`CGWindowListCopyWindowInfo`** | Enumerate all visible windows with owner name, title, bounds | Screen Recording (macOS 10.15+) |
| **`NSWorkspace`** | List running apps, observe launch/termination | None |
| **`NSRunningApplication`** | Activate/focus a specific app | None |

**Key findings:**
- Window/tab titles are reliably readable across all major terminals
- iTerm2 has the richest automation (AppleScript dictionary, Python API, URL schemes)
- Terminal.app has solid AppleScript support
- GPU-rendered terminals (Alacritty, Kitty) expose titles but not text content via accessibility
- Tab-level focus switching works for iTerm2, Terminal.app, and Warp via their respective APIs

### Windows

| API | Capability | Permission Required |
|-----|-----------|---------------------|
| **`EnumWindows`** + `GetWindowText` | Enumerate all top-level windows and titles | None |
| **UI Automation** (`IUIAutomation`) | Drill into tab controls, enumerate/select individual tabs | None |
| **`SetForegroundWindow`** | Switch focus to a specific window | Caller must be foreground process |
| **`wt.exe` CLI** | `new-tab`, `focus-tab --target <idx>`, `-w <window-id>` | None |

**Key findings:**
- No special permissions needed — significantly simpler than macOS
- Windows Terminal tabs are controllable via both UI Automation and `wt.exe` CLI
- Git Bash (mintty) windows are discoverable via `EnumWindows`
- `wt.exe` supports targeting specific Windows Terminal instances with `-w`

---

## Claude Code Integration Points

Claude Code already provides strong primitives for programmatic control:

| Feature | How It Helps |
|---------|-------------|
| `--name` / `-n` flag | Sets display name shown in terminal title — natural label for to-do items |
| `--session-id` | Unique identifier for each session |
| `--resume` / `-r` | Resume sessions by name or ID |
| `--output-format stream-json` | Structured status output for real-time tracking |
| **Agent SDK** (npm: `@anthropic-ai/claude-code`, PyPI: `claude-code-sdk`) | Full programmatic control with event hooks (`SessionStart`, `SessionEnd`, `TaskCompleted`) |
| **Hooks system** | Shell scripts that fire on session events — can register with the app |
| **Status line script** | Receives JSON blob with `session_id` on stdin |
| **Process `cwd`** | Detectable via `proc_pidinfo` (macOS) or `NtQueryInformationProcess` (Windows) — maps sessions to project directories |

### Session Discovery

Running `claude` processes can be found by:
1. Walking the process tree to find `claude` ancestor processes
2. Matching PIDs to windows via `CGWindowListCopyWindowInfo` (macOS) or `EnumWindows` (Windows)
3. Reading the process `cwd` to determine which project directory each session is in

---

## Recommended Architecture

### Core Approach

The app **launches and owns sessions** rather than trying to discover arbitrary terminal windows. This gives full control over session lifecycle.

```
┌─────────────────────────────┐
│       Claude Todo App       │
│  ┌───────────────────────┐  │
│  │     To-Do List UI     │  │
│  └──────────┬────────────┘  │
│             │               │
│  ┌──────────▼────────────┐  │
│  │   Session Manager     │  │
│  │  - Launch sessions    │  │
│  │  - Track status       │  │
│  │  - Resume sessions    │  │
│  └──────────┬────────────┘  │
│             │               │
│  ┌──────────▼────────────┐  │
│  │  Platform Adapters    │  │
│  │  - macOS (AX, AS)     │  │
│  │  - Windows (Win32)    │  │
│  └──────────┬────────────┘  │
│             │               │
└─────────────┼───────────────┘
              │
    ┌─────────▼─────────┐
    │  Terminal Windows  │
    │  (Claude Code CLI) │
    └───────────────────┘
```

### Features by Priority

**P0 — Core:**
- Create to-do items linked to Claude Code sessions
- Launch a new Claude Code session per to-do item (with `--name`)
- List all active sessions with status
- Click to focus/switch to a session's terminal window

**P1 — Session Management:**
- Resume paused sessions
- Adopt existing running Claude Code sessions ("find and import")
- Track session completion via `stream-json` or hooks

**P2 — Power User:**
- tmux backend as optional session manager (macOS/Linux)
- Keyboard shortcuts for rapid context switching
- Session grouping by project

### Terminal Adapter Strategy

Each terminal needs a specific adapter:

| Terminal | macOS Adapter | Windows Adapter |
|----------|--------------|-----------------|
| iTerm2 | AppleScript (best support) | N/A |
| Terminal.app | AppleScript | N/A |
| Warp | Accessibility API | N/A |
| Windows Terminal | N/A | `wt.exe` CLI + UI Automation |
| Git Bash (mintty) | N/A | `EnumWindows` |
| Alacritty | Accessibility API (title only) | `EnumWindows` |

---

## Framework Recommendation

### Tauri (Recommended)

- **Bundle size:** ~10MB (vs ~100MB+ Electron)
- **Memory:** ~30MB (vs ~200-300MB Electron)
- **Backend:** Rust — direct access to `core-foundation` (macOS) and `windows-rs` (Windows) crates
- **Frontend:** Web (React/Svelte/etc.) — Claude Code SDK (TypeScript) integrates naturally
- **Cross-platform:** Tauri 2.0 has strong macOS and Windows support

### Alternatives Considered

| Framework | Verdict |
|-----------|---------|
| **Electron** | Too heavy for a utility app (~200MB RAM, 100MB+ bundle) |
| **SwiftUI + WinUI** | Best native feel but 2x development cost (two codebases) |
| **Flutter** | Desktop support immature; FFI to OS window APIs is cumbersome |

---

## Technical Constraints & Risks

### Hardest Parts

1. **Per-terminal adapters** — Each terminal app has different automation APIs; requires ongoing maintenance as terminals update
2. **macOS permissions** — Accessibility permission is required and must be manually granted; first-run UX needs to guide users through this
3. **Tab-level control for third-party terminals** — Terminals without AppleScript/automation support (Alacritty, Kitty) can only be focused at the window level, not tab level

### Mitigations

- **Owned sessions** approach (app launches sessions itself) avoids the hardest discovery problems
- **Start with iTerm2 + Windows Terminal** — best automation support, most popular choices
- Consider **embedding a terminal** (e.g., xterm.js in the Tauri webview) for a fully controlled experience

### Security Considerations

- Avoid reading/storing terminal content — could expose secrets, API keys, passwords
- Window title reading is minimally invasive and sufficient for tracking
- If using Claude Code SDK to spawn sessions, the app needs API credentials stored securely (OS keychain)

---

## Existing Prior Art & References

- [AXSwift](https://github.com/tmandry/AXSwift) — Swift wrapper for macOS Accessibility API
- [Swindler](https://github.com/tmandry/Swindler) — macOS window management library
- [claude-code-terminal-title](https://github.com/bluzername/claude-code-terminal-title) — Sets Claude Code terminal titles
- [wttab](https://github.com/lalilaloe/wttab) — Programmatic Windows Terminal tab control
- [sesh](https://github.com/joshmedeski/sesh) — Terminal session manager (tmux-based)
- [Claude Code CLI Reference](https://docs.anthropic.com/en/docs/claude-code/cli-reference)
- [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk)

---

## Next Steps

1. Set up Tauri project scaffold with TypeScript frontend
2. Build macOS window discovery proof-of-concept (Accessibility API)
3. Build Windows window discovery proof-of-concept (`EnumWindows`)
4. Integrate Claude Code SDK for session launch/management
5. Design the to-do list UI with session status indicators
