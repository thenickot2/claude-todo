import { describe, it, expect } from "vitest";
import { parseTodoFile, serializeTodoFile } from "./storage";
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

describe("round-trip", () => {
  it("parse → serialize → parse produces same data", () => {
    const first = parseTodoFile(SAMPLE);
    const serialized = serializeTodoFile(first);
    const second = parseTodoFile(serialized);
    expect(second).toEqual(first);
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
});
