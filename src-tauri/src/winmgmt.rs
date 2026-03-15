use super::WindowInfo;
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, WPARAM, TRUE};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    IsWindowVisible, PostMessageW, SetForegroundWindow, WM_CLOSE,
};

unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let windows = &mut *(lparam.0 as *mut Vec<WindowInfo>);

    if !IsWindowVisible(hwnd).as_bool() {
        return TRUE;
    }

    let len = GetWindowTextLengthW(hwnd);
    if len == 0 {
        return TRUE;
    }

    let mut buf = vec![0u16; (len + 1) as usize];
    let actual = GetWindowTextW(hwnd, &mut buf);
    if actual == 0 {
        return TRUE;
    }

    let title = OsString::from_wide(&buf[..actual as usize])
        .to_string_lossy()
        .to_string();

    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));

    windows.push(WindowInfo {
        hwnd: hwnd.0 as isize,
        title,
        pid,
    });

    TRUE
}

pub fn find_claude_windows() -> Vec<WindowInfo> {
    let mut windows: Vec<WindowInfo> = Vec::new();
    unsafe {
        let _ = EnumWindows(
            Some(enum_callback),
            LPARAM(&mut windows as *mut Vec<WindowInfo> as isize),
        );
    }

    windows
        .into_iter()
        .filter(|w| w.title.contains("Claude: "))
        .collect()
}

pub fn focus_window(hwnd: isize) -> bool {
    unsafe {
        let handle = HWND(hwnd as *mut _);
        SetForegroundWindow(handle).as_bool()
    }
}

pub fn find_all_windows() -> Vec<WindowInfo> {
    let mut windows: Vec<WindowInfo> = Vec::new();
    unsafe {
        let _ = EnumWindows(
            Some(enum_callback),
            LPARAM(&mut windows as *mut Vec<WindowInfo> as isize),
        );
    }
    windows
}

pub fn close_window(hwnd: isize) -> bool {
    unsafe {
        let handle = HWND(hwnd as *mut _);
        PostMessageW(Some(handle), WM_CLOSE, WPARAM(0), LPARAM(0)).is_ok()
    }
}
