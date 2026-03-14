import { Command } from "@tauri-apps/plugin-shell";

export interface ClaudeSession {
  kill: () => void;
}

export function terminalTitle(taskTitle: string): string {
  return `Claude: ${taskTitle}`;
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
  const claudeArgs = ["--name", title];
  if (projectPath) {
    claudeArgs.push("--add-dir", projectPath);
  }
  if (flags) {
    claudeArgs.push(...flags);
  }
  if (extraArgs) {
    claudeArgs.push(...extraArgs.split(/\s+/).filter(Boolean));
  }

  // Launch claude in its own Windows Terminal window with a locked title
  // Using --window new so we can close this window independently
  const tabTitle = terminalTitle(title);
  const wtArgs = [
    "--window",
    "new",
    "new-tab",
    "--title",
    tabTitle,
    "--suppressApplicationTitle",
  ];
  // Set the terminal's starting directory so Claude opens in the right place
  if (projectPath) {
    wtArgs.push("-d", projectPath);
  }
  wtArgs.push("claude", ...claudeArgs);

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
