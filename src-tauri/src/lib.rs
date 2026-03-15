#[cfg(target_os = "windows")]
mod winmgmt;

#[cfg(target_os = "macos")]
mod macmgmt;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct WindowInfo {
    pub hwnd: isize,
    pub title: String,
    pub pid: u32,
}

#[tauri::command]
fn find_terminal_windows() -> Result<Vec<WindowInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        Ok(winmgmt::find_claude_windows())
    }
    #[cfg(target_os = "macos")]
    {
        Ok(macmgmt::find_claude_windows())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Ok(Vec::new())
    }
}

#[tauri::command]
fn focus_terminal_window(hwnd: isize) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        Ok(winmgmt::focus_window(hwnd))
    }
    #[cfg(target_os = "macos")]
    {
        Ok(macmgmt::focus_window(hwnd))
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = hwnd;
        Ok(false)
    }
}

/// Find a terminal window whose title contains `title_substring` and focus it.
#[tauri::command]
fn focus_terminal_by_title(title_substring: String) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let windows = winmgmt::find_all_windows();
        for w in windows {
            if w.title.contains(&title_substring) {
                return Ok(winmgmt::focus_window(w.hwnd));
            }
        }
        Ok(false)
    }
    #[cfg(target_os = "macos")]
    {
        let windows = macmgmt::find_all_windows();
        for w in windows {
            if w.title.contains(&title_substring) {
                return Ok(macmgmt::focus_window(w.hwnd));
            }
        }
        Ok(false)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = title_substring;
        Ok(false)
    }
}

/// Find a terminal window whose title contains `title_substring` and close it.
/// Returns true if a matching window was found and closed.
#[tauri::command]
fn close_terminal_by_title(title_substring: String) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let windows = winmgmt::find_all_windows();
        for w in windows {
            if w.title.contains(&title_substring) {
                return Ok(winmgmt::close_window(w.hwnd));
            }
        }
        Ok(false)
    }
    #[cfg(target_os = "macos")]
    {
        let windows = macmgmt::find_all_windows();
        for w in windows {
            if w.title.contains(&title_substring) {
                return Ok(macmgmt::close_window(w.hwnd));
            }
        }
        Ok(false)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = title_substring;
        Ok(false)
    }
}

/// Launch a command in a new terminal window/tab (macOS only).
/// On macOS, uses iTerm2 if available, otherwise Terminal.app.
/// On Windows, returns false (Windows uses the `wt` shell command from TypeScript).
#[tauri::command]
fn launch_terminal_session(title: String, command: String, working_dir: Option<String>) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(macmgmt::launch_in_terminal(&title, &command, working_dir.as_deref()))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (title, command, working_dir);
        Ok(false)
    }
}

/// Check if macOS accessibility/automation permissions are available.
/// Always returns true on non-macOS platforms.
#[tauri::command]
fn check_accessibility_permission() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(macmgmt::check_accessibility())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            find_terminal_windows,
            focus_terminal_window,
            focus_terminal_by_title,
            close_terminal_by_title,
            launch_terminal_session,
            check_accessibility_permission,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
