import { describe, it, expect } from "vitest";
import { parseTodoFile, serializeTodoFile, todayString } from "./storage";
import { TodoFile } from "./types";

const SAMPLE = `# Claude Todo

## Not Started
- [ ] Refactor auth module | project:/Users/nick/myapp | created:2026-03-14
- [ ] Write integration tests | project:/Users/nick/myapp | created:2026-03-13

## In Progress
- [ ] Fix login bug | project:/Users/nick/myapp | session:abc123 | started:2026-03-14

## Done
- [x] Set up CI pipeline | project:/Users/nick/myapp | session:ghi789 | completed:2026-03-12
`;

describe("parseTodoFile", () => {
  it("parses all three sections", () => {
    const result = parseTodoFile(SAMPLE);
    expect(result.notStarted).toHaveLength(2);
    expect(result.inProgress).toHaveLength(1);
    expect(result.done).toHaveLength(1);
  });

  it("parses item titles", () => {
    const result = parseTodoFile(SAMPLE);
    expect(result.notStarted[0].title).toBe("Refactor auth module");
    expect(result.inProgress[0].title).toBe("Fix login bug");
    expect(result.done[0].title).toBe("Set up CI pipeline");
  });

  it("parses metadata fields", () => {
    const result = parseTodoFile(SAMPLE);
    expect(result.notStarted[0].project).toBe("/Users/nick/myapp");
    expect(result.notStarted[0].created).toBe("2026-03-14");
    expect(result.inProgress[0].sessionId).toBe("abc123");
    expect(result.inProgress[0].started).toBe("2026-03-14");
    expect(result.done[0].completed).toBe("2026-03-12");
  });

  it("handles empty file", () => {
    const result = parseTodoFile("");
    expect(result.notStarted).toHaveLength(0);
    expect(result.inProgress).toHaveLength(0);
    expect(result.done).toHaveLength(0);
  });

  it("handles file with only headers", () => {
    const result = parseTodoFile(
      "# Claude Todo\n\n## Not Started\n\n## In Progress\n\n## Done\n",
    );
    expect(result.notStarted).toHaveLength(0);
    expect(result.inProgress).toHaveLength(0);
    expect(result.done).toHaveLength(0);
  });

  it("handles items without metadata", () => {
    const result = parseTodoFile("## Not Started\n- [ ] Simple task\n");
    expect(result.notStarted).toHaveLength(1);
    expect(result.notStarted[0].title).toBe("Simple task");
    expect(result.notStarted[0].project).toBeUndefined();
  });

  it("handles Windows paths with colons in directory", () => {
    const input = `## Not Started\n- [ ] Task | directory:C:\\Users\\nick\\app | created:2026-03-14\n`;
    const result = parseTodoFile(input);
    expect(result.notStarted[0].directory).toBe("C:\\Users\\nick\\app");
  });

  it("ignores lines before any section header", () => {
    const input = `# Claude Todo\n\nSome random text\n- [ ] Orphan task\n\n## Not Started\n- [ ] Real task\n`;
    const result = parseTodoFile(input);
    expect(result.notStarted).toHaveLength(1);
    expect(result.notStarted[0].title).toBe("Real task");
  });

  it("ignores malformed lines", () => {
    const input = `## Not Started\n- [] Missing space\n- [x] Valid done item\n- Not a checkbox\n`;
    const result = parseTodoFile(input);
    expect(result.notStarted).toHaveLength(1);
    expect(result.notStarted[0].title).toBe("Valid done item");
  });

  it("parses single flag without trailing comma", () => {
    const input = `## Not Started\n- [ ] Task | flags:--dangerously-skip-permissions\n`;
    const result = parseTodoFile(input);
    expect(result.notStarted[0].flags).toEqual(["--dangerously-skip-permissions"]);
  });
});

describe("serializeTodoFile", () => {
  it("produces valid markdown", () => {
    const file: TodoFile = {
      notStarted: [{ title: "Task A", project: "/foo", created: "2026-03-14" }],
      inProgress: [{ title: "Task B", sessionId: "abc", started: "2026-03-14" }],
      done: [{ title: "Task C", completed: "2026-03-12" }],
    };
    const output = serializeTodoFile(file);
    expect(output).toContain("# Claude Todo");
    expect(output).toContain("## Not Started");
    expect(output).toContain("- [ ] Task A | project:/foo | created:2026-03-14");
    expect(output).toContain("- [ ] Task B | session:abc | started:2026-03-14");
    expect(output).toContain("- [x] Task C | completed:2026-03-12");
  });

  it("handles empty sections", () => {
    const file: TodoFile = { notStarted: [], inProgress: [], done: [] };
    const output = serializeTodoFile(file);
    expect(output).toContain("## Not Started");
    expect(output).toContain("## In Progress");
    expect(output).toContain("## Done");
  });
});

describe("parseTodoFile — new fields", () => {
  it("parses directory, flags, and extraArgs", () => {
    const input = `## Not Started
- [ ] Build feature | directory:C:/Users/nick/myapp | flags:--dangerously-skip-permissions,--verbose | extraArgs:--model opus | created:2026-03-14
`;
    const result = parseTodoFile(input);
    expect(result.notStarted[0].directory).toBe("C:/Users/nick/myapp");
    expect(result.notStarted[0].flags).toEqual(["--dangerously-skip-permissions", "--verbose"]);
    expect(result.notStarted[0].extraArgs).toBe("--model opus");
  });

  it("handles items with directory but no flags", () => {
    const input = `## In Progress
- [ ] Task | directory:/projects/foo | started:2026-03-14
`;
    const result = parseTodoFile(input);
    expect(result.inProgress[0].directory).toBe("/projects/foo");
    expect(result.inProgress[0].flags).toBeUndefined();
    expect(result.inProgress[0].extraArgs).toBeUndefined();
  });
});

describe("serializeTodoFile — new fields", () => {
  it("serializes directory, flags, and extraArgs", () => {
    const file: TodoFile = {
      notStarted: [{
        title: "Task X",
        directory: "C:/projects/app",
        flags: ["--dangerously-skip-permissions"],
        extraArgs: "--model opus",
        created: "2026-03-14",
      }],
      inProgress: [],
      done: [],
    };
    const text = serializeTodoFile(file);
    expect(text).toContain("directory:C:/projects/app");
    expect(text).toContain("flags:--dangerously-skip-permissions");
    expect(text).toContain("extraArgs:--model opus");
  });

  it("does not serialize empty flags array", () => {
    const file: TodoFile = {
      notStarted: [{ title: "No flags", flags: [] }],
      inProgress: [],
      done: [],
    };
    const text = serializeTodoFile(file);
    expect(text).not.toContain("flags:");
  });
});

describe("round-trip", () => {
  it("parse → serialize → parse produces same data", () => {
    const first = parseTodoFile(SAMPLE);
    const serialized = serializeTodoFile(first);
    const second = parseTodoFile(serialized);
    expect(second).toEqual(first);
  });

  it("round-trips items with directory, flags, and extraArgs", () => {
    const file: TodoFile = {
      notStarted: [{
        title: "Task X",
        directory: "C:/projects/app",
        flags: ["--dangerously-skip-permissions"],
        extraArgs: "--model opus",
        created: "2026-03-14",
      }],
      inProgress: [],
      done: [],
    };
    const text = serializeTodoFile(file);
    const parsed = parseTodoFile(text);
    expect(parsed.notStarted[0]).toEqual(file.notStarted[0]);
  });

  it("serialize → parse → serialize produces same text", () => {
    const file: TodoFile = {
      notStarted: [
        { title: "A", project: "/app", created: "2026-01-01" },
        { title: "B", created: "2026-01-02" },
      ],
      inProgress: [
        { title: "C", project: "/app", sessionId: "s1", started: "2026-01-03" },
      ],
      done: [
        { title: "D", project: "/app", sessionId: "s2", completed: "2026-01-04" },
      ],
    };
    const text1 = serializeTodoFile(file);
    const parsed = parseTodoFile(text1);
    const text2 = serializeTodoFile(parsed);
    expect(text2).toBe(text1);
  });

  it("round-trips all fields across all sections", () => {
    const file: TodoFile = {
      notStarted: [{
        title: "Full item",
        project: "/old/path",
        directory: "C:/new/path",
        flags: ["--dangerously-skip-permissions", "--verbose"],
        extraArgs: "--model opus",
        created: "2026-03-14",
      }],
      inProgress: [{
        title: "Active task",
        directory: "/projects/foo",
        flags: ["--dangerously-skip-permissions"],
        sessionId: "abc123",
        started: "2026-03-14",
      }],
      done: [{
        title: "Finished task",
        directory: "/projects/bar",
        extraArgs: "--effort high",
        sessionId: "def456",
        completed: "2026-03-14",
      }],
    };
    const text = serializeTodoFile(file);
    const parsed = parseTodoFile(text);
    const text2 = serializeTodoFile(parsed);
    expect(parsed).toEqual(file);
    expect(text2).toBe(text);
  });
});

describe("todayString", () => {
  it("returns a YYYY-MM-DD string", () => {
    const result = todayString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns today's date", () => {
    const expected = new Date().toISOString().slice(0, 10);
    expect(todayString()).toBe(expected);
  });
});
