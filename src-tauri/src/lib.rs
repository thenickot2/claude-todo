#[cfg(target_os = "windows")]
mod winmgmt;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
struct WindowInfo {
    hwnd: isize,
    title: String,
    pid: u32,
}

#[tauri::command]
fn find_terminal_windows() -> Vec<WindowInfo> {
    #[cfg(target_os = "windows")]
    {
        winmgmt::find_claude_windows()
            .into_iter()
            .map(|w| WindowInfo {
                hwnd: w.hwnd,
                title: w.title,
                pid: w.pid,
            })
            .collect()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

#[tauri::command]
fn focus_terminal_window(hwnd: isize) -> bool {
    #[cfg(target_os = "windows")]
    {
        winmgmt::focus_window(hwnd)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = hwnd;
        false
    }
}

/// Find a terminal window whose title contains `title_substring` and focus it.
#[tauri::command]
fn focus_terminal_by_title(title_substring: String) -> bool {
    #[cfg(target_os = "windows")]
    {
        let windows = winmgmt::find_all_windows();
        for w in windows {
            if w.title.contains(&title_substring) {
                return winmgmt::focus_window(w.hwnd);
            }
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = title_substring;
        false
    }
}

/// Find a terminal window whose title contains `title_substring` and close it.
/// Returns true if a matching window was found and closed.
#[tauri::command]
fn close_terminal_by_title(title_substring: String) -> bool {
    #[cfg(target_os = "windows")]
    {
        let windows = winmgmt::find_all_windows();
        for w in windows {
            if w.title.contains(&title_substring) {
                return winmgmt::close_window(w.hwnd);
            }
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = title_substring;
        false
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
