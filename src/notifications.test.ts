import { describe, it, expect } from "vitest";
import { parseSignalFile, notificationLabel } from "./notifications";

describe("parseSignalFile", () => {
  it("parses a valid idle_prompt signal", () => {
    const json = JSON.stringify({
      session_id: "abc-123",
      hook_event_name: "Notification",
      notification: { type: "idle_prompt" },
    });
    const result = parseSignalFile("signal-1.json", json);
    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("abc-123");
    expect(result!.type).toBe("idle_prompt");
    expect(result!.fileName).toBe("signal-1.json");
    expect(typeof result!.timestamp).toBe("number");
  });

  it("parses permission_prompt", () => {
    const json = JSON.stringify({
      session_id: "def-456",
      notification: { type: "permission_prompt" },
    });
    const result = parseSignalFile("signal-2.json", json);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("permission_prompt");
  });

  it("parses elicitation_dialog", () => {
    const json = JSON.stringify({
      session_id: "ghi-789",
      notification: { type: "elicitation_dialog" },
    });
    const result = parseSignalFile("signal-3.json", json);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("elicitation_dialog");
  });

  it("handles type at top level (fallback)", () => {
    const json = JSON.stringify({
      session_id: "abc-123",
      type: "idle_prompt",
    });
    const result = parseSignalFile("signal.json", json);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("idle_prompt");
  });

  it("returns null for missing session_id", () => {
    const json = JSON.stringify({
      notification: { type: "idle_prompt" },
    });
    expect(parseSignalFile("bad.json", json)).toBeNull();
  });

  it("returns null for empty session_id", () => {
    const json = JSON.stringify({
      session_id: "",
      notification: { type: "idle_prompt" },
    });
    expect(parseSignalFile("bad.json", json)).toBeNull();
  });

  it("returns null for unknown notification type", () => {
    const json = JSON.stringify({
      session_id: "abc",
      notification: { type: "unknown_event" },
    });
    expect(parseSignalFile("bad.json", json)).toBeNull();
  });

  it("returns null for missing notification type", () => {
    const json = JSON.stringify({
      session_id: "abc",
      hook_event_name: "Notification",
    });
    expect(parseSignalFile("bad.json", json)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseSignalFile("bad.json", "not json{")).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    expect(parseSignalFile("bad.json", '"just a string"')).toBeNull();
    expect(parseSignalFile("bad.json", "42")).toBeNull();
    expect(parseSignalFile("bad.json", "null")).toBeNull();
  });

  it("returns null for empty content", () => {
    expect(parseSignalFile("bad.json", "")).toBeNull();
  });
});

describe("notificationLabel", () => {
  it("returns correct labels", () => {
    expect(notificationLabel("idle_prompt")).toBe("Waiting for input");
    expect(notificationLabel("permission_prompt")).toBe("Needs permission");
    expect(notificationLabel("elicitation_dialog")).toBe("Asking a question");
  });
});
