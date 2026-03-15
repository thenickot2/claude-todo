import { NotificationType, SessionNotification } from "./types";

export const SIGNAL_DIR_NAME = "idle-signals";

const VALID_TYPES: Set<string> = new Set([
  "idle_prompt",
  "permission_prompt",
  "elicitation_dialog",
]);

/**
 * Parse a signal file's JSON content into a SessionNotification.
 * Returns null for malformed or irrelevant signals.
 */
export function parseSignalFile(
  fileName: string,
  content: string,
): SessionNotification | null {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return null;
  }

  if (!data || typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;
  const sessionId = obj.session_id;
  if (typeof sessionId !== "string" || !sessionId) return null;

  // Extract notification type — could be nested under "notification" or at top level
  let notifType: string | undefined;
  const notification = obj.notification;
  if (notification && typeof notification === "object") {
    const nt = (notification as Record<string, unknown>).type;
    if (typeof nt === "string") notifType = nt;
  }
  // Fallback: check top-level "type" field
  if (!notifType && typeof obj.type === "string") {
    notifType = obj.type;
  }

  if (!notifType || !VALID_TYPES.has(notifType)) return null;

  return {
    sessionId,
    type: notifType as NotificationType,
    fileName,
    timestamp: Date.now(),
  };
}

export function notificationLabel(type: NotificationType): string {
  switch (type) {
    case "idle_prompt":
      return "Waiting for input";
    case "permission_prompt":
      return "Needs permission";
    case "elicitation_dialog":
      return "Asking a question";
  }
}
