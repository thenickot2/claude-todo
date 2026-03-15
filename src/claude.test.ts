import { describe, it, expect } from "vitest";
import { terminalTitle, buildClaudeArgs, buildWtArgs, splitArgs } from "./claude";

describe("terminalTitle", () => {
  it("prefixes with Claude:", () => {
    expect(terminalTitle("Fix login bug")).toBe("Claude: Fix login bug");
  });

  it("handles empty title", () => {
    expect(terminalTitle("")).toBe("Claude: ");
  });
});

describe("buildClaudeArgs", () => {
  it("builds minimal args with title only", () => {
    const args = buildClaudeArgs("My task", undefined, undefined, undefined);
    expect(args).toEqual(["--name", "My task"]);
  });

  it("includes --add-dir when projectPath is set", () => {
    const args = buildClaudeArgs("Task", "C:/projects/app", undefined, undefined);
    expect(args).toEqual(["--name", "Task", "--add-dir", "C:/projects/app"]);
  });

  it("appends flags", () => {
    const args = buildClaudeArgs(
      "Task",
      undefined,
      ["--dangerously-skip-permissions", "--verbose"],
      undefined,
    );
    expect(args).toEqual([
      "--name", "Task",
      "--dangerously-skip-permissions",
      "--verbose",
    ]);
  });

  it("splits extraArgs on whitespace", () => {
    const args = buildClaudeArgs("Task", undefined, undefined, "--model opus --effort high");
    expect(args).toEqual([
      "--name", "Task",
      "--model", "opus",
      "--effort", "high",
    ]);
  });

  it("combines all options", () => {
    const args = buildClaudeArgs(
      "Full task",
      "/home/user/project",
      ["--dangerously-skip-permissions"],
      "--model opus",
    );
    expect(args).toEqual([
      "--name", "Full task",
      "--add-dir", "/home/user/project",
      "--dangerously-skip-permissions",
      "--model", "opus",
    ]);
  });

  it("ignores empty extraArgs", () => {
    const args = buildClaudeArgs("Task", undefined, undefined, "   ");
    expect(args).toEqual(["--name", "Task"]);
  });

  it("ignores empty flags array", () => {
    const args = buildClaudeArgs("Task", undefined, [], undefined);
    expect(args).toEqual(["--name", "Task"]);
  });
});

describe("splitArgs", () => {
  it("splits simple whitespace-separated args", () => {
    expect(splitArgs("--model opus")).toEqual(["--model", "opus"]);
  });

  it("handles double-quoted strings", () => {
    expect(splitArgs('--prompt "fix the bug"')).toEqual(["--prompt", "fix the bug"]);
  });

  it("handles single-quoted strings", () => {
    expect(splitArgs("--prompt 'fix the bug'")).toEqual(["--prompt", "fix the bug"]);
  });

  it("handles multiple spaces between args", () => {
    expect(splitArgs("  --model   opus  ")).toEqual(["--model", "opus"]);
  });

  it("returns empty array for empty string", () => {
    expect(splitArgs("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(splitArgs("   ")).toEqual([]);
  });

  it("handles mixed quoted and unquoted args", () => {
    expect(splitArgs('--model opus --prompt "hello world" --verbose')).toEqual([
      "--model", "opus", "--prompt", "hello world", "--verbose",
    ]);
  });
});

describe("buildWtArgs", () => {
  it("builds wt args without project path", () => {
    const claudeArgs = ["--name", "Task"];
    const args = buildWtArgs("Task", undefined, claudeArgs);
    expect(args).toEqual([
      "--window", "new",
      "new-tab",
      "--title", "Claude: Task",
      "--suppressApplicationTitle",
      "claude", "--name", "Task",
    ]);
  });

  it("includes -d when projectPath is set", () => {
    const claudeArgs = ["--name", "Task", "--add-dir", "C:/app"];
    const args = buildWtArgs("Task", "C:/app", claudeArgs);
    expect(args).toContain("-d");
    expect(args).toContain("C:/app");
    // -d should come before "claude"
    const dIndex = args.indexOf("-d");
    const claudeIndex = args.indexOf("claude");
    expect(dIndex).toBeLessThan(claudeIndex);
  });
});
