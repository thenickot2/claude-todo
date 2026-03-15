import { Command } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";

export interface ClaudeSession {
  kill: () => void;
}

const IS_MACOS = navigator.platform.startsWith("Mac");

/** Split a string into args, respecting single and double quotes. */
export function splitArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuote: string | null = null;
  for (const ch of input) {
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (/\s/.test(ch)) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

export function terminalTitle(taskTitle: string): string {
  return `Claude: ${taskTitle}`;
}

/** Build the CLI arguments for the `claude` command. */
export function buildClaudeArgs(
  title: string,
  projectPath: string | undefined,
  flags: string[] | undefined,
  extraArgs: string | undefined,
): string[] {
  const args = ["--name", title];
  if (projectPath) {
    args.push("--add-dir", projectPath);
  }
  if (flags) {
    args.push(...flags);
  }
  if (extraArgs) {
    args.push(...splitArgs(extraArgs));
  }
  return args;
}

/** Build the full `wt` arguments including the claude subcommand (Windows only). */
export function buildWtArgs(
  title: string,
  projectPath: string | undefined,
  claudeArgs: string[],
): string[] {
  const tabTitle = terminalTitle(title);
  const args = [
    "--window",
    "new",
    "new-tab",
    "--title",
    tabTitle,
    "--suppressApplicationTitle",
  ];
  if (projectPath) {
    args.push("-d", projectPath);
  }
  args.push("claude", ...claudeArgs);
  return args;
}

/** Build a shell command string from claude args (for macOS terminal launch). */
function buildClaudeCommand(claudeArgs: string[]): string {
  return ["claude", ...claudeArgs]
    .map((a) => {
      // Quote args that contain spaces or special chars
      if (/["\s]/.test(a)) {
        return `"${a.replace(/"/g, '\\"')}"`;
      }
      return a;
    })
    .join(" ");
}

/**
 * Launch Claude Code in a new terminal window/tab.
 * On Windows: uses Windows Terminal (`wt`) via shell plugin.
 * On macOS: uses a Tauri command that launches via AppleScript (iTerm2 or Terminal.app).
 */
export async function launchSession(
  title: string,
  projectPath: string | undefined,
  flags: string[] | undefined,
  extraArgs: string | undefined,
): Promise<ClaudeSession> {
  const claudeArgs = buildClaudeArgs(title, projectPath, flags, extraArgs);

  if (IS_MACOS) {
    const command = buildClaudeCommand(claudeArgs);
    await invoke("launch_terminal_session", {
      title: terminalTitle(title),
      command,
      workingDir: projectPath ?? null,
    });
  } else {
    const wtArgs = buildWtArgs(title, projectPath, claudeArgs);
    const cmd = Command.create("wt", wtArgs);
    const child = await cmd.spawn();
    void child;
  }

  return {
    kill: () => {
      // Can't kill the terminal tab from here — user closes it manually
    },
  };
}

export async function resumeSession(
  sessionId: string,
): Promise<ClaudeSession> {
  const resumeTitle = `Claude: resume ${sessionId.slice(0, 8)}`;

  if (IS_MACOS) {
    const command = `claude --resume ${sessionId}`;
    await invoke("launch_terminal_session", {
      title: resumeTitle,
      command,
      workingDir: null,
    });
  } else {
    const wtArgs = [
      "--window",
      "new",
      "new-tab",
      "--title",
      resumeTitle,
      "--suppressApplicationTitle",
      "claude",
      "--resume",
      sessionId,
    ];
    const cmd = Command.create("wt", wtArgs);
    const child = await cmd.spawn();
    void child;
  }

  return {
    kill: () => {},
  };
}
