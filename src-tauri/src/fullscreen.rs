//! Per-display fullscreen detection. Foreground alone is insufficient when a
//! video/game remains fullscreen on one monitor while another monitor is used.
use std::collections::HashSet;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT};
use windows::Win32::Graphics::Dwm::{
    DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::System::Threading::GetCurrentProcessId;
use windows::Win32::UI::Shell::{SHQueryUserNotificationState, QUNS_RUNNING_D3D_FULL_SCREEN};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect,
    GetWindowThreadProcessId, IsIconic, IsWindowVisible, GWL_EXSTYLE, GWL_STYLE, WS_CAPTION,
    WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_THICKFRAME,
};

pub struct Display {
    pub name: String,
    pub screen: RECT,
}

struct Window {
    rect: RECT,
    borderless: bool,
    overlay: bool,
}

unsafe extern "system" fn collect(hwnd: HWND, param: LPARAM) -> BOOL {
    if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
        return BOOL(1);
    }
    let mut pid = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == GetCurrentProcessId() {
        return BOOL(1);
    }
    let mut class = [0u16; 128];
    let len = GetClassNameW(hwnd, &mut class) as usize;
    let class = String::from_utf16_lossy(&class[..len]);
    if matches!(
        class.as_str(),
        "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "Progman" | "WorkerW"
    ) {
        return BOOL(1);
    }
    let mut cloaked = 0u32;
    let _ = DwmGetWindowAttribute(
        hwnd,
        DWMWA_CLOAKED,
        &mut cloaked as *mut _ as *mut _,
        std::mem::size_of::<u32>() as u32,
    );
    if cloaked != 0 {
        return BOOL(1);
    }
    let mut rect = RECT::default();
    if DwmGetWindowAttribute(
        hwnd,
        DWMWA_EXTENDED_FRAME_BOUNDS,
        &mut rect as *mut _ as *mut _,
        std::mem::size_of::<RECT>() as u32,
    )
    .is_err()
        && GetWindowRect(hwnd, &mut rect).is_err()
    {
        return BOOL(1);
    }
    if rect.right <= rect.left || rect.bottom <= rect.top {
        return BOOL(1);
    }
    let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
    let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
    (&mut *(param.0 as *mut Vec<Window>)).push(Window {
        rect,
        borderless: style & (WS_CAPTION.0 | WS_THICKFRAME.0) == 0,
        overlay: ex & (WS_EX_TOOLWINDOW.0 | WS_EX_NOACTIVATE.0) != 0,
    });
    BOOL(1)
}

fn covers(window: &RECT, screen: &RECT) -> bool {
    const TOLERANCE: i32 = 2;
    window.left <= screen.left + TOLERANCE
        && window.top <= screen.top + TOLERANCE
        && window.right >= screen.right - TOLERANCE
        && window.bottom >= screen.bottom - TOLERANCE
}

fn overlap_area(a: &RECT, b: &RECT) -> i64 {
    i64::from((a.right.min(b.right) - a.left.max(b.left)).max(0))
        * i64::from((a.bottom.min(b.bottom) - a.top.max(b.top)).max(0))
}

fn is_fullscreen(screen: &RECT, windows: &[Window]) -> bool {
    // EnumWindows enumerates in Z order. A substantial normal window above a
    // fullscreen surface means the monitor is being used for normal desktop
    // work. Small video controls/notifications must not turn fullscreen off.
    let screen_area = overlap_area(screen, screen);
    if screen_area == 0 {
        return false;
    }
    for window in windows {
        if window.borderless && covers(&window.rect, screen) {
            return true;
        }
        if !window.overlay && overlap_area(&window.rect, screen) * 4 >= screen_area {
            return false;
        }
    }
    false
}

pub unsafe fn detect(displays: &[Display]) -> Result<HashSet<String>, String> {
    let mut windows = Vec::<Window>::new();
    EnumWindows(Some(collect), LPARAM(&mut windows as *mut _ as isize))
        .map_err(|error| error.to_string())?;
    let mut fullscreen: HashSet<String> = displays
        .iter()
        .filter(|display| is_fullscreen(&display.screen, &windows))
        .map(|display| display.name.clone())
        .collect();
    // Exclusive D3D surfaces may not expose normal window bounds. The shell
    // signal is only supplemental and applies to the foreground display.
    if SHQueryUserNotificationState()
        .map(|state| state == QUNS_RUNNING_D3D_FULL_SCREEN)
        .unwrap_or(false)
    {
        let foreground = GetForegroundWindow();
        let mut pid = 0;
        GetWindowThreadProcessId(foreground, Some(&mut pid));
        if !foreground.0.is_null()
            && pid != GetCurrentProcessId()
            && !IsIconic(foreground).as_bool()
        {
            let monitor = MonitorFromWindow(foreground, MONITOR_DEFAULTTONEAREST);
            let mut info = MONITORINFO {
                cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if GetMonitorInfoW(monitor, &mut info).as_bool() {
                for display in displays {
                    if display.screen == info.rcMonitor {
                        fullscreen.insert(display.name.clone());
                    }
                }
            }
        }
    }
    Ok(fullscreen)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn rect(x: i32, y: i32, w: i32, h: i32) -> RECT {
        RECT {
            left: x,
            top: y,
            right: x + w,
            bottom: y + h,
        }
    }
    fn window(rect: RECT, borderless: bool) -> Window {
        Window {
            rect,
            borderless,
            overlay: false,
        }
    }
    #[test]
    fn fullscreen_on_secondary_survives_primary_foreground() {
        let windows = [
            window(rect(0, 0, 1920, 1040), false),
            window(rect(1920, 0, 1920, 1080), true),
        ];
        assert!(!is_fullscreen(&rect(0, 0, 1920, 1080), &windows));
        assert!(is_fullscreen(&rect(1920, 0, 1920, 1080), &windows));
    }
    #[test]
    fn ordinary_maximized_window_without_taskbar_is_not_fullscreen() {
        assert!(!is_fullscreen(
            &rect(0, 0, 1920, 1080),
            &[window(rect(0, 0, 1920, 1080), false)]
        ));
    }
    #[test]
    fn small_controls_do_not_end_fullscreen_but_large_desktop_windows_do() {
        let screen = rect(0, 0, 1920, 1080);
        assert!(is_fullscreen(
            &screen,
            &[window(rect(50, 50, 300, 100), false), window(screen, true)]
        ));
        assert!(!is_fullscreen(
            &screen,
            &[
                window(rect(100, 100, 1200, 800), false),
                window(screen, true)
            ]
        ));
    }
    #[test]
    fn spanning_fullscreen_covers_negative_coordinate_monitor() {
        let windows = [window(rect(-1920, 0, 3840, 1080), true)];
        assert!(is_fullscreen(&rect(-1920, 0, 1920, 1080), &windows));
        assert!(is_fullscreen(&rect(0, 0, 1920, 1080), &windows));
    }
    #[test]
    fn bounds_allow_rounding_but_not_work_area_maximization() {
        let screen = rect(0, 0, 1920, 1080);
        assert!(covers(&rect(1, 1, 1918, 1078), &screen));
        assert!(!covers(&rect(0, 0, 1920, 1040), &screen));
    }
    #[test]
    fn nonactivating_overlay_does_not_cancel_fullscreen() {
        let screen = rect(0, 0, 1920, 1080);
        let mut overlay = window(rect(0, 0, 1600, 900), false);
        overlay.overlay = true;
        assert!(is_fullscreen(&screen, &[overlay, window(screen, true)]));
    }
    #[test]
    fn borderless_window_in_work_area_is_not_fullscreen() {
        let screen = rect(0, 0, 1920, 1080);
        assert!(!is_fullscreen(
            &screen,
            &[window(rect(0, 0, 1920, 1040), true)]
        ));
    }
}
