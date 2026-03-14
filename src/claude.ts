import { Command } from "@tauri-apps/plugin-shell";

export interface ClaudeSession {
  kill: () => void;
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
    args.push(...extraArgs.split(/\s+/).filter(Boolean));
  }
  return args;
}

/** Build the full `wt` arguments including the claude subcommand. */
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

/**
 * Launch Claude Code in a new Windows Terminal tab.
 * The `wt` command opens the terminal; `claude` runs interactively inside it.
 * We use a wrapper approach: spawn `wt` which exits immediately after opening
 * the tab, so we can't track session completion from the wt process.
 */
export async function launchSession(
  title: string,
  projectPath: string | undefined,
  flags: string[] | undefined,
  extraArgs: string | undefined,
  onDone: () => void,
): Promise<ClaudeSession> {
  const claudeArgs = buildClaudeArgs(title, projectPath, flags, extraArgs);
  const wtArgs = buildWtArgs(title, projectPath, claudeArgs);

  const cmd = Command.create("wt", wtArgs);

  cmd.on("close", () => {
    // wt exits immediately after spawning the tab, so this fires right away.
    // We can't track session completion from here — the user will manually
    // mark the todo as done, or we detect it via session polling later.
  });

  const child = await cmd.spawn();

  // Since wt exits immediately, call onDone after a brief delay
  // so the UI can register that the launch succeeded.
  // The session stays "running" until the user moves it to Done.
  void child;
  void onDone;

  return {
    kill: () => {
      // Can't kill the terminal tab from here — user closes it manually
    },
  };
}

export async function resumeSession(
  sessionId: string,
  onDone: () => void,
): Promise<ClaudeSession> {
  const wtArgs = [
    "--window",
    "new",
    "new-tab",
    "--title",
    `Claude: resume ${sessionId.slice(0, 8)}`,
    "--suppressApplicationTitle",
    "claude",
    "--resume",
    sessionId,
  ];

  const cmd = Command.create("wt", wtArgs);
  const child = await cmd.spawn();
  void child;
  void onDone;

  return {
    kill: () => {},
  };
}
