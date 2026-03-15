use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct WindowInfo {
    pub hwnd: isize, // window id on macOS
    pub title: String,
    pub pid: u32,
}

/// Find terminal windows that likely contain Claude sessions.
pub fn find_claude_windows() -> Vec<WindowInfo> {
    let mut windows = find_all_windows();
    windows.retain(|w| {
        let t = w.title.to_lowercase();
        t.contains("claude") || t.contains("bash") || t.contains("zsh") || t.contains("terminal")
    });
    windows
}

/// List all windows from Terminal.app and iTerm2.
pub fn find_all_windows() -> Vec<WindowInfo> {
    let mut windows = Vec::new();
    windows.extend(find_app_windows("Terminal"));
    windows.extend(find_app_windows("iTerm2"));
    windows
}

fn find_app_windows(app_name: &str) -> Vec<WindowInfo> {
    let script = format!(
        r#"
tell application "System Events"
    if not (exists process "{app}") then return ""
    set pid to unix id of process "{app}"
end tell
tell application "{app}"
    set output to ""
    repeat with w in windows
        set output to output & (id of w) & "||" & (name of w) & "||" & pid & linefeed
    end repeat
    return output
end tell
"#,
        app = app_name
    );

    run_applescript_window_query(&script)
}

fn run_applescript_window_query(script: &str) -> Vec<WindowInfo> {
    let output = Command::new("osascript").arg("-e").arg(script).output();

    match output {
        Ok(out) if out.status.success() => {
            let text = String::from_utf8_lossy(&out.stdout);
            text.lines()
                .filter(|l| !l.is_empty())
                .filter_map(|line| {
                    let parts: Vec<&str> = line.split("||").collect();
                    if parts.len() >= 3 {
                        Some(WindowInfo {
                            hwnd: parts[0].trim().parse().unwrap_or(0),
                            title: parts[1].trim().to_string(),
                            pid: parts[2].trim().parse().unwrap_or(0),
                        })
                    } else {
                        None
                    }
                })
                .collect()
        }
        _ => Vec::new(),
    }
}

/// Focus a terminal window by its window ID. Tries Terminal.app then iTerm2.
pub fn focus_window(hwnd: isize) -> bool {
    focus_window_in_app("Terminal", hwnd) || focus_window_in_app("iTerm2", hwnd)
}

fn focus_window_in_app(app_name: &str, window_id: isize) -> bool {
    let script = format!(
        r#"
tell application "{app}"
    activate
    repeat with w in windows
        if id of w is {id} then
            set index of w to 1
            return true
        end if
    end repeat
end tell
return false
"#,
        app = app_name,
        id = window_id
    );

    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Close a terminal window by its window ID. Tries Terminal.app then iTerm2.
pub fn close_window(hwnd: isize) -> bool {
    close_window_in_app("Terminal", hwnd) || close_window_in_app("iTerm2", hwnd)
}

fn close_window_in_app(app_name: &str, window_id: isize) -> bool {
    let script = format!(
        r#"
tell application "{app}"
    repeat with w in windows
        if id of w is {id} then
            close w
            return true
        end if
    end repeat
end tell
return false
"#,
        app = app_name,
        id = window_id
    );

    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Launch a command in a new terminal window/tab.
/// Prefers iTerm2 if installed, falls back to Terminal.app.
pub fn launch_in_terminal(title: &str, command: &str, working_dir: Option<&str>) -> bool {
    if is_iterm2_available() {
        launch_in_iterm2(title, command, working_dir)
    } else {
        launch_in_terminal_app(title, command, working_dir)
    }
}

fn is_iterm2_available() -> bool {
    std::path::Path::new("/Applications/iTerm.app").exists()
}

fn launch_in_iterm2(title: &str, command: &str, working_dir: Option<&str>) -> bool {
    let cd_prefix = match working_dir {
        Some(dir) => format!("cd {} && ", shell_escape(dir)),
        None => String::new(),
    };
    let full_command = format!("{}{}", cd_prefix, command);

    let script = format!(
        r#"
tell application "iTerm2"
    activate
    set newWindow to (create window with default profile command "{cmd}")
    tell current session of current window
        set name to "{title}"
    end tell
end tell
"#,
        cmd = applescript_escape(&full_command),
        title = applescript_escape(title),
    );

    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn launch_in_terminal_app(title: &str, command: &str, working_dir: Option<&str>) -> bool {
    let cd_prefix = match working_dir {
        Some(dir) => format!("cd {} && ", shell_escape(dir)),
        None => String::new(),
    };
    let full_command = format!("{}{}", cd_prefix, command);

    let script = format!(
        r#"
tell application "Terminal"
    activate
    set newTab to do script "{cmd}"
    set custom title of newTab to "{title}"
end tell
"#,
        cmd = applescript_escape(&full_command),
        title = applescript_escape(title),
    );

    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Check if the app has basic automation/accessibility permissions.
pub fn check_accessibility() -> bool {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(r#"tell application "System Events" to return name of first process"#)
        .output();
    matches!(output, Ok(o) if o.status.success())
}

/// Escape a string for use inside AppleScript double-quoted strings.
fn applescript_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Escape a path for use in a shell command.
fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}
