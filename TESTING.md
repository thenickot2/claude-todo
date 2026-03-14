# Testing Conventions

## Quick Reference

```bash
# TypeScript unit tests
npx vitest run

# TypeScript tests in watch mode
npx vitest

# Type-check (catches many bugs for free)
npx tsc --noEmit

# Rust tests (from src-tauri/)
cargo test
```

---

## TypeScript (Vitest)

### What to test

**Pure functions** — highest ROI. Parser/serializer round-trips, date helpers, any logic that doesn't touch Tauri APIs. These are fast, reliable, and catch real bugs.

**Test files live next to source**: `storage.ts` → `storage.test.ts`. No separate `__tests__/` directory.

### Mocking Tauri APIs

Use Tauri's built-in mock module when you need to test code that calls `invoke()`:

```ts
import { mockIPC, mockWindows, clearMocks } from "@tauri-apps/api/mocks";

beforeEach(() => {
  mockIPC((cmd, args) => {
    if (cmd === "find_terminal_windows") return [];
    if (cmd === "focus_terminal_window") return true;
  });
  mockWindows("main");
});

afterEach(() => {
  clearMocks();
});
```

- `mockIPC(handler)` — intercepts all `invoke()` calls
- `mockWindows("main")` — simulates window labels (first arg is "current" window)
- Always call `clearMocks()` in `afterEach`

### When to add component tests

We do **not** currently use `@testing-library/react`. The UI is tightly coupled to Tauri IPC, so component tests would mostly test mock wiring. If `App.tsx` is split into multiple components with non-trivial logic, reconsider. Setup would be:

```bash
npm install -D @testing-library/react @testing-library/dom jsdom
```

Then configure `vitest.config.ts` with `environment: 'jsdom'`.

### Conventions

- Use `describe` blocks to group related tests
- Test names should describe the behavior, not the implementation: `"round-trips items with directory and flags"` not `"test parseItem"`
- Every new field on `TodoItem` needs a parse test, a serialize test, and a round-trip test in `storage.test.ts`

---

## Rust (cargo test)

### Inline `#[cfg(test)]` modules

All Rust tests go in inline modules within the source file. We do **not** use the `tests/` integration test directory — our commands are private functions and don't expose a public library API worth testing externally.

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_something() {
        assert_eq!(1 + 1, 2);
    }
}
```

### What to test in Rust

**Pure logic extracted from platform code.** The Win32 FFI calls in `winmgmt.rs` require a live desktop session and can't be meaningfully unit tested. Instead, extract testable logic (e.g., title matching, filtering) into pure functions:

```rust
fn is_claude_window(title: &str) -> bool {
    title.contains("Claude:")
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_is_claude_window() {
        assert!(super::is_claude_window("Claude: my task"));
        assert!(!super::is_claude_window("Firefox"));
    }
}
```

### Tauri mock runtime (`tauri::test`)

Not currently needed. Our `#[tauri::command]` functions don't take `AppHandle` or `Window` parameters — they're plain functions callable without Tauri's runtime. If we add commands that use managed state or window handles, enable the test feature:

```toml
# Cargo.toml
[dev-dependencies]
tauri = { version = "2", features = ["test"] }
```

Then use `tauri::test::mock_builder()`, `mock_context()`, `noop_assets()` to build a test app instance, and `assert_ipc_response()` to test IPC routing and serialization.

### Platform-specific code (`#[cfg]`)

- Code behind `#[cfg(target_os = "windows")]` only compiles/runs on Windows
- Provide a no-op fallback behind `#[cfg(not(target_os = "windows"))]` so tests pass on all platforms
- Don't try to mock Win32 APIs — test the logic around them, accept that FFI calls are verified manually

---

## What NOT to Test

For a small utility app, these have low ROI:

- **E2E / WebDriver tests** — heavyweight setup, macOS unsupported, and the critical paths (terminal management, window focus) aren't reachable via WebDriver. Use manual testing.
- **Tauri plugin interactions** — fs, shell, dialog plugins call OS APIs that can't be mocked. Keep the I/O layer thin (`fileio.ts`) and test the pure logic it wraps (`storage.ts`).
- **Permission scopes** — `capabilities/default.json` has no automated test tooling. Review manually when changing scopes.
- **Snapshot tests of serialized markdown** — round-trip tests already cover correctness better.

---

## Testing Checklist for PRs

1. `npx vitest run` — all tests pass
2. `npx tsc --noEmit` — no type errors
3. `cargo test` (in `src-tauri/`) — all Rust tests pass
4. If you added a new `TodoItem` field: parse, serialize, and round-trip tests added
5. If you added a new Tauri command: consider whether logic can be extracted and unit tested
6. Manual smoke test: launch the app, verify the feature works in both light and dark mode
