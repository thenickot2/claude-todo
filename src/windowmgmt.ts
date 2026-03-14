import { invoke } from "@tauri-apps/api/core";

export interface TerminalWindow {
  hwnd: number;
  title: string;
  pid: number;
}

export async function findTerminalWindows(): Promise<TerminalWindow[]> {
  return invoke<TerminalWindow[]>("find_terminal_windows");
}

export async function focusTerminalWindow(hwnd: number): Promise<boolean> {
  return invoke<boolean>("focus_terminal_window", { hwnd });
}

export async function focusTerminalByTitle(
  titleSubstring: string,
): Promise<boolean> {
  return invoke<boolean>("focus_terminal_by_title", { titleSubstring });
}

export async function closeTerminalByTitle(
  titleSubstring: string,
): Promise<boolean> {
  return invoke<boolean>("close_terminal_by_title", { titleSubstring });
}
