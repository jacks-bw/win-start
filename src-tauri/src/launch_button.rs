// 热区按钮：Rust 原生透明分层窗口（无 WebView 进程）。
// 每个显示器一个，默认盖在屏幕左下角系统开始按钮上；
// 点击切换本软件开始菜单；托盘菜单可进入编辑模式拖拽/缩放，位置按显示器持久化。

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use windows::core::w;
use windows::Win32::Foundation::{
    BOOL, COLORREF, HINSTANCE, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM,
};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, CreatePen, CreateSolidBrush, DeleteObject, EndPaint, EnumDisplayMonitors, FillRect,
    GetMonitorInfoW, InvalidateRect, LineTo, MonitorFromWindow, MoveToEx, SelectObject, HBRUSH,
    HDC, HGDIOBJ, HMONITOR, MONITORINFO, MONITORINFOEXW, MONITOR_DEFAULTTONEAREST, PAINTSTRUCT,
    PS_DASH, PS_SOLID,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::UI::HiDpi::{GetDpiForMonitor, GetDpiForWindow, MDT_EFFECTIVE_DPI};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetCapture, GetKeyState, ReleaseCapture, SetActiveWindow, SetCapture, SetFocus, VK_DOWN,
    VK_ESCAPE, VK_LEFT, VK_RIGHT, VK_SHIFT, VK_UP,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
    GetWindowLongPtrW, GetWindowRect, IsIconic, IsWindowVisible, KillTimer, LoadCursorW,
    PostMessageW, RegisterClassW, RegisterWindowMessageW, SetCursor, SetLayeredWindowAttributes,
    SetTimer, SetWindowLongPtrW, SetWindowPos, ShowWindow, TranslateMessage, EVENT_OBJECT_CLOAKED,
    EVENT_OBJECT_HIDE, EVENT_OBJECT_LOCATIONCHANGE, EVENT_OBJECT_REORDER, EVENT_OBJECT_SHOW,
    EVENT_OBJECT_UNCLOAKED, EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_MINIMIZEEND,
    EVENT_SYSTEM_MINIMIZESTART, GWL_EXSTYLE, HMENU, HTCLIENT, HWND_TOPMOST, IDC_HAND, LWA_ALPHA,
    MA_NOACTIVATE, MINMAXINFO, MSG, OBJID_WINDOW, SC_MINIMIZE, SWP_FRAMECHANGED, SWP_NOACTIVATE,
    SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SW_HIDE, SW_RESTORE, SW_SHOWNOACTIVATE, WINDOW_EX_STYLE,
    WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS, WM_APP, WM_CAPTURECHANGED, WM_DESTROY,
    WM_DISPLAYCHANGE, WM_DPICHANGED, WM_ERASEBKGND, WM_EXITSIZEMOVE, WM_GETMINMAXINFO, WM_KEYDOWN,
    WM_KILLFOCUS, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEACTIVATE, WM_NCHITTEST, WM_NCLBUTTONDOWN,
    WM_PAINT, WM_SETCURSOR, WM_SETTINGCHANGE, WM_SYSCOMMAND, WM_TIMER, WM_WINDOWPOSCHANGING,
    WNDCLASSW, WS_EX_LAYERED, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_TRANSPARENT,
    WS_POPUP,
};

const CLASS_BTN: PCWSTR = w!("WinStartHotZone");
const CLASS_CTL: PCWSTR = w!("WinStartHotZoneCtl");
const WM_TOGGLE_EDIT: u32 = WM_APP + 1;
const WM_REFRESH: u32 = WM_APP + 2;

use windows::core::PCWSTR;

const DEFAULT_SIZE_LOGICAL: i32 = 48;
const MIN_SIZE_LOGICAL: i32 = 24;
// 自愈周期（对齐 Electron 版 1 秒）：定时恢复被隐藏/降层的热区按钮
const HEAL_INTERVAL_MS: u32 = 1000;

// 按钮在正常模式下近乎全透明（1/255），但仍接收鼠标事件；编辑模式下提高透明度
const ALPHA_NORMAL: u8 = 1;
const ALPHA_EDIT: u8 = 70;
const ALPHA_SELECTED: u8 = 130;
// 键盘微调步长（物理像素）：方向键 1px，Shift+方向键 10px
const KB_STEP: i32 = 1;
const KB_STEP_FAST: i32 = 10;

#[derive(Serialize, Deserialize, Clone, Copy)]
struct BtnRect {
    x: i32,
    y: i32,
    w: i32,
    h: i32,
}

struct MonInfo {
    name: String,
    work: RECT,
    screen: RECT,
    dpi: u32,
}

struct BtnEntry {
    device: String,
    dpi: u32,
    screen: RECT,
    paused: bool,
}

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static EDIT_MODE: AtomicBool = AtomicBool::new(false);
static CONTROLLER_HWND: AtomicIsize = AtomicIsize::new(0);
// 编辑模式下当前选中的热区按钮（用于高亮 + 键盘微调）
static SELECTED: AtomicIsize = AtomicIsize::new(0);
static PRESSED: AtomicIsize = AtomicIsize::new(0);
static REFRESH_PENDING: AtomicBool = AtomicBool::new(false);
// hwnd(isize) -> 按钮信息
static WINDOW_MAP: OnceLock<Mutex<HashMap<isize, BtnEntry>>> = OnceLock::new();

fn map() -> &'static Mutex<HashMap<isize, BtnEntry>> {
    WINDOW_MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

fn config_path() -> std::path::PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("win-start")
        .join("launch-buttons.json")
}

fn load_all_configs() -> HashMap<String, BtnRect> {
    match std::fs::read_to_string(config_path()) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

fn save_config(device: &str, r: BtnRect) {
    let mut all = load_all_configs();
    all.insert(device.to_string(), r);
    let path = config_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(s) = serde_json::to_string_pretty(&all) {
        let _ = std::fs::write(path, s);
    }
}

fn rect_valid(r: &BtnRect, work: &RECT, min: i32) -> bool {
    r.w >= min
        && r.h >= min
        && r.x < work.right
        && r.x + r.w > work.left
        && r.y < work.bottom
        && r.y + r.h > work.top
}

// ===================== 启动入口（主线程调用） =====================

pub fn start(app: AppHandle) {
    let _ = APP_HANDLE.set(app);
    std::thread::spawn(|| unsafe {
        run_ui_thread();
    });
}

/// 托盘菜单：切换编辑模式
pub fn set_edit_mode(edit: bool) {
    EDIT_MODE.store(edit, Ordering::SeqCst);
    let h = CONTROLLER_HWND.load(Ordering::SeqCst);
    if h != 0 {
        unsafe {
            let _ = PostMessageW(
                HWND(h as *mut _),
                WM_TOGGLE_EDIT,
                WPARAM(edit as usize),
                LPARAM(0),
            );
        }
    }
}

// ===================== UI 线程 =====================

unsafe fn run_ui_thread() {
    let hinst = match GetModuleHandleW(None) {
        Ok(h) => HINSTANCE(h.0),
        Err(_) => return,
    };

    let btn_class = WNDCLASSW {
        lpfnWndProc: Some(btn_proc),
        hInstance: hinst,
        lpszClassName: CLASS_BTN,
        hbrBackground: HBRUSH(std::ptr::null_mut()),
        ..Default::default()
    };
    RegisterClassW(&btn_class);

    let ctl_class = WNDCLASSW {
        lpfnWndProc: Some(ctl_proc),
        hInstance: hinst,
        lpszClassName: CLASS_CTL,
        hbrBackground: HBRUSH(std::ptr::null_mut()),
        ..Default::default()
    };
    RegisterClassW(&ctl_class);

    // Hidden top-level window receives broadcasts as well as controller messages.
    let ctl = CreateWindowExW(
        WINDOW_EX_STYLE(0),
        CLASS_CTL,
        CLASS_CTL,
        WS_POPUP,
        0,
        0,
        0,
        0,
        HWND(std::ptr::null_mut()),
        HMENU(std::ptr::null_mut()),
        hinst,
        None,
    );
    if let Ok(h) = ctl {
        CONTROLLER_HWND.store(h.0 as isize, Ordering::SeqCst);
        SetTimer(h, 1, HEAL_INTERVAL_MS, None);
    }

    let hooks = install_hooks();
    tick_buttons();

    let mut msg = MSG::default();
    while GetMessageW(&mut msg, None, 0, 0).0 > 0 {
        let _ = TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
    for hook in hooks {
        let _ = UnhookWinEvent(hook);
    }
    CONTROLLER_HWND.store(0, Ordering::SeqCst);
}

// ===================== 显示器枚举 =====================

unsafe extern "system" fn enum_proc(mon: HMONITOR, _hdc: HDC, _rc: *mut RECT, lp: LPARAM) -> BOOL {
    let out = &mut *(lp.0 as *mut Vec<MonInfo>);
    let mut mi = MONITORINFOEXW::default();
    mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    if GetMonitorInfoW(mon, &mut mi as *mut _ as *mut MONITORINFO).as_bool() {
        let mut dpi_x = 96u32;
        let mut dpi_y = 96u32;
        let _ = GetDpiForMonitor(mon, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);
        let name = String::from_utf16_lossy(&mi.szDevice)
            .trim_end_matches('\0')
            .to_string();
        out.push(MonInfo {
            name,
            work: mi.monitorInfo.rcWork,
            screen: mi.monitorInfo.rcMonitor,
            dpi: dpi_x,
        });
    }
    BOOL(1)
}

unsafe fn enumerate_monitors() -> Vec<MonInfo> {
    let out: Vec<MonInfo> = Vec::new();
    let boxed = Box::new(out);
    let raw = Box::into_raw(boxed);
    let _ = EnumDisplayMonitors(None, None, Some(enum_proc), LPARAM(raw as isize));
    *Box::from_raw(raw)
}

// ===================== 按钮创建 / 同步 / 自愈 =====================

unsafe fn default_rect(screen: &RECT, work: &RECT, dpi: u32) -> BtnRect {
    let scale = dpi as f32 / 96.0;
    let size = (DEFAULT_SIZE_LOGICAL as f32 * scale).round() as i32;
    BtnRect {
        x: if work.right < screen.right {
            screen.right - size
        } else {
            screen.left
        },
        y: if work.top > screen.top || work.left > screen.left || work.right < screen.right {
            screen.top
        } else {
            screen.bottom - size
        },
        w: size,
        h: size,
    }
}

unsafe fn create_button(m: &MonInfo, cfg: Option<BtnRect>) -> Option<HWND> {
    let scale = m.dpi as f32 / 96.0;
    let min = (MIN_SIZE_LOGICAL as f32 * scale).round() as i32;
    let mut r = cfg
        .filter(|r| rect_valid(r, &m.screen, min))
        .unwrap_or_else(|| default_rect(&m.screen, &m.work, m.dpi));
    r.w = r.w.max(min).min(m.screen.right - m.screen.left);
    r.h = r.h.max(min).min(m.screen.bottom - m.screen.top);
    r.x = r.x.clamp(m.screen.left, m.screen.right - r.w);
    r.y = r.y.clamp(m.screen.top, m.screen.bottom - r.h);

    let hinst = GetModuleHandleW(None).ok().map(|h| HINSTANCE(h.0))?;
    let mut exstyle = WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW;
    if !EDIT_MODE.load(Ordering::SeqCst) {
        exstyle |= WS_EX_NOACTIVATE;
    }
    let hwnd = CreateWindowExW(
        exstyle,
        CLASS_BTN,
        CLASS_BTN,
        WS_POPUP,
        r.x,
        r.y,
        r.w,
        r.h,
        HWND(std::ptr::null_mut()),
        HMENU(std::ptr::null_mut()),
        hinst,
        None,
    )
    .ok()?;

    let _ = SetLayeredWindowAttributes(
        hwnd,
        COLORREF(0),
        if EDIT_MODE.load(Ordering::SeqCst) {
            ALPHA_EDIT
        } else {
            ALPHA_NORMAL
        },
        LWA_ALPHA,
    );
    // Keep hidden until the controller computes this display's state.
    Some(hwnd)
}

/// Reconcile every monitor, preserving a hotzone's monitor-relative position
/// across display rearrangement and scaling changes. Existing JSON remains valid.
unsafe fn reconcile_buttons() {
    let mons = enumerate_monitors();
    let present: HashSet<String> = mons.iter().map(|m| m.name.clone()).collect();
    let dead: Vec<isize> = map()
        .lock()
        .unwrap()
        .iter()
        .filter(|(_, entry)| !present.contains(&entry.device))
        .map(|(key, _)| *key)
        .collect();
    for key in dead {
        map().lock().unwrap().remove(&key);
        let _ = DestroyWindow(HWND(key as *mut _));
    }
    let mut configs = None;
    for monitor in &mons {
        let existing = map()
            .lock()
            .unwrap()
            .iter()
            .find(|(_, entry)| entry.device == monitor.name)
            .map(|(key, entry)| (*key, entry.dpi, entry.screen));
        if let Some((key, dpi, previous)) = existing {
            if dpi != monitor.dpi || previous != monitor.screen {
                let hwnd = HWND(key as *mut _);
                let mut rect = RECT::default();
                if GetWindowRect(hwnd, &mut rect).is_ok() {
                    let scale = monitor.dpi as f64 / dpi.max(1) as f64;
                    let min = (MIN_SIZE_LOGICAL as f64 * monitor.dpi as f64 / 96.0).round() as i32;
                    let w = (((rect.right - rect.left) as f64 * scale).round() as i32)
                        .max(min)
                        .min(monitor.screen.right - monitor.screen.left);
                    let h = (((rect.bottom - rect.top) as f64 * scale).round() as i32)
                        .max(min)
                        .min(monitor.screen.bottom - monitor.screen.top);
                    let x = (monitor.screen.left
                        + ((rect.left - previous.left) as f64 * scale).round() as i32)
                        .clamp(monitor.screen.left, monitor.screen.right - w);
                    let y = (monitor.screen.top
                        + ((rect.top - previous.top) as f64 * scale).round() as i32)
                        .clamp(monitor.screen.top, monitor.screen.bottom - h);
                    let _ = SetWindowPos(
                        hwnd,
                        HWND(std::ptr::null_mut()),
                        x,
                        y,
                        w,
                        h,
                        SWP_NOACTIVATE | SWP_NOZORDER,
                    );
                    save_config(&monitor.name, BtnRect { x, y, w, h });
                }
                if let Some(entry) = map().lock().unwrap().get_mut(&key) {
                    entry.dpi = monitor.dpi;
                    entry.screen = monitor.screen;
                }
            }
        } else {
            let saved = configs
                .get_or_insert_with(load_all_configs)
                .get(&monitor.name)
                .copied();
            if let Some(hwnd) = create_button(monitor, saved) {
                map().lock().unwrap().insert(
                    hwnd.0 as isize,
                    BtnEntry {
                        device: monitor.name.clone(),
                        dpi: monitor.dpi,
                        screen: monitor.screen,
                        paused: true,
                    },
                );
            }
        }
    }
}

/// Never hold WINDOW_MAP across Win32 calls: window procedures may reenter.
unsafe fn apply_state(hwnd: HWND, paused: bool) {
    let mut ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
    if EDIT_MODE.load(Ordering::SeqCst) {
        ex &= !WS_EX_NOACTIVATE.0;
    } else {
        ex |= WS_EX_NOACTIVATE.0;
    }
    if paused {
        ex |= WS_EX_TRANSPARENT.0;
    } else {
        ex &= !WS_EX_TRANSPARENT.0;
    }
    if ex != GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 {
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex as isize);
        let _ = SetWindowPos(
            hwnd,
            HWND(std::ptr::null_mut()),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
    }
    if paused {
        if PRESSED.load(Ordering::SeqCst) == hwnd.0 as isize {
            PRESSED.store(0, Ordering::SeqCst);
            if GetCapture() == hwnd {
                let _ = ReleaseCapture();
            }
        }
        if IsWindowVisible(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_HIDE);
        }
        return;
    }
    if IsIconic(hwnd).as_bool() {
        let _ = ShowWindow(hwnd, SW_RESTORE);
    }
    if !IsWindowVisible(hwnd).as_bool() {
        let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
    }
    if !EDIT_MODE.load(Ordering::SeqCst) {
        let _ = SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

unsafe fn apply_edit_mode() {
    if !EDIT_MODE.load(Ordering::SeqCst) {
        SELECTED.store(0, Ordering::SeqCst);
    }
    refresh_selection();
}

/// 选中状态变化后刷新所有按钮的透明度与边框绘制
unsafe fn refresh_selection() {
    let edit = EDIT_MODE.load(Ordering::SeqCst);
    let keys: Vec<isize> = map().lock().unwrap().keys().copied().collect();
    for key in keys {
        let hwnd = HWND(key as *mut _);
        let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), button_alpha(hwnd, edit), LWA_ALPHA);
        let _ = InvalidateRect(hwnd, None, BOOL(1));
    }
}

unsafe fn button_alpha(hwnd: HWND, edit: bool) -> u8 {
    if !edit {
        ALPHA_NORMAL
    } else if SELECTED.load(Ordering::SeqCst) == hwnd.0 as isize {
        ALPHA_SELECTED
    } else {
        ALPHA_EDIT
    }
}

/// External events drive refresh; the watchdog covers missed shell events.
unsafe fn tick_buttons() -> bool {
    reconcile_buttons();
    let fullscreen = if EDIT_MODE.load(Ordering::SeqCst) {
        HashSet::new()
    } else {
        match fullscreen_devices() {
            Ok(displays) => displays,
            Err(error) => {
                eprintln!("[hotzone] fullscreen scan failed, keeping previous state: {error}");
                return false;
            }
        }
    };
    let entries: Vec<(isize, bool)> = {
        let mut windows = map().lock().unwrap();
        windows
            .iter_mut()
            .map(|(key, entry)| {
                entry.paused = fullscreen.contains(&entry.device);
                (*key, entry.paused)
            })
            .collect()
    };
    for (key, paused) in entries {
        apply_state(HWND(key as *mut _), paused);
    }
    true
}

unsafe fn fullscreen_devices() -> Result<HashSet<String>, String> {
    let displays = enumerate_monitors()
        .into_iter()
        .map(|m| crate::fullscreen::Display {
            name: m.name,
            screen: m.screen,
        })
        .collect::<Vec<_>>();
    crate::fullscreen::detect(&displays)
}

fn request_refresh() {
    if REFRESH_PENDING.swap(true, Ordering::SeqCst) {
        return;
    }
    let hwnd = CONTROLLER_HWND.load(Ordering::SeqCst);
    if hwnd == 0 {
        REFRESH_PENDING.store(false, Ordering::SeqCst);
        return;
    }
    unsafe {
        if PostMessageW(HWND(hwnd as *mut _), WM_REFRESH, WPARAM(0), LPARAM(0)).is_err() {
            REFRESH_PENDING.store(false, Ordering::SeqCst);
        }
    }
}

unsafe extern "system" fn win_event(
    _hook: HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    object: i32,
    _child: i32,
    _thread: u32,
    _time: u32,
) {
    if event >= EVENT_OBJECT_SHOW && event != EVENT_OBJECT_REORDER && object != OBJID_WINDOW.0 {
        return;
    }
    if !hwnd.0.is_null() || event == EVENT_OBJECT_REORDER {
        request_refresh();
    }
}

unsafe fn install_hooks() -> Vec<HWINEVENTHOOK> {
    let mut hooks = Vec::new();
    for event in [
        EVENT_SYSTEM_FOREGROUND,
        EVENT_SYSTEM_MINIMIZESTART,
        EVENT_SYSTEM_MINIMIZEEND,
        EVENT_OBJECT_SHOW,
        EVENT_OBJECT_HIDE,
        EVENT_OBJECT_REORDER,
        EVENT_OBJECT_LOCATIONCHANGE,
        EVENT_OBJECT_CLOAKED,
        EVENT_OBJECT_UNCLOAKED,
    ] {
        let hook = SetWinEventHook(
            event,
            event,
            None,
            Some(win_event),
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        );
        if !hook.0.is_null() {
            hooks.push(hook);
        } else {
            eprintln!("[hotzone] event hook {event} unavailable; watchdog active");
        }
    }
    hooks
}

// ===================== 点击行为 =====================

unsafe fn toggle_menu(button: HWND) {
    let Some(app) = APP_HANDLE.get() else {
        return;
    };
    let Some(win) = app.get_webview_window("main") else {
        return;
    };

    let btn_mon = MonitorFromWindow(button, MONITOR_DEFAULTTONEAREST);

    // 在热区按钮上方定位菜单（以该按钮所在屏幕的工作区为准）
    let mut br = RECT::default();
    let _ = GetWindowRect(button, &mut br);
    if let Ok(size) = win.outer_size() {
        let mon = MonitorFromWindow(button, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFOEXW::default();
        mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if GetMonitorInfoW(mon, &mut mi as *mut _ as *mut MONITORINFO).as_bool() {
            let work = mi.monitorInfo.rcWork;
            let mw = size.width as i32;
            let mh = size.height as i32;
            let mut x = (br.left + br.right) / 2 - mw / 2;
            x = x.clamp(work.left, (work.right - mw).max(work.left));
            let mut y = br.top - mh;
            if y < work.top {
                y = work.top;
            }
            crate::request_menu_toggle(app, Some((x, y, btn_mon.0 as isize)));
            return;
        }
    }

    crate::request_menu_toggle(app, None);
}

// ===================== 编辑模式：拖拽 / 缩放 / 绘制 =====================

unsafe fn edit_hit_test(hwnd: HWND, lp: LPARAM) -> i32 {
    let mut r = RECT::default();
    let _ = GetWindowRect(hwnd, &mut r);
    let px = ((lp.0 as i32) as u16) as i16 as i32;
    let py = (((lp.0 >> 16) as i32) as u16) as i16 as i32;
    let dpi = GetDpiForWindow(hwnd) as i32;
    let b = 8 * dpi / 96;
    let left = px >= r.left && px < r.left + b;
    let right = px < r.right && px >= r.right - b;
    let top = py >= r.top && py < r.top + b;
    let bottom = py < r.bottom && py >= r.bottom - b;
    // HITTEST 值：HTLEFT=10, HTRIGHT=11, HTTOP=12, HTTOPLEFT=13,
    // HTTOPRIGHT=14, HTBOTTOM=15, HTBOTTOMLEFT=16, HTBOTTOMRIGHT=17, HTCAPTION=2
    match (top, bottom, left, right) {
        (true, false, true, false) => 13,
        (true, false, false, true) => 14,
        (false, true, true, false) => 16,
        (false, true, false, true) => 17,
        (true, false, _, _) => 12,
        (false, true, _, _) => 15,
        (_, _, true, false) => 10,
        (_, _, false, true) => 11,
        _ => 2,
    }
}

unsafe fn paint_button(hwnd: HWND) {
    let mut ps = PAINTSTRUCT::default();
    let hdc = BeginPaint(hwnd, &mut ps);
    let mut wr = RECT::default();
    let _ = GetWindowRect(hwnd, &mut wr);
    let cr = RECT {
        left: 0,
        top: 0,
        right: wr.right - wr.left,
        bottom: wr.bottom - wr.top,
    };
    let edit = EDIT_MODE.load(Ordering::SeqCst);
    let selected = SELECTED.load(Ordering::SeqCst) == hwnd.0 as isize;
    if edit {
        // 系统主题蓝 BGR = 0x00D47800
        let brush = CreateSolidBrush(COLORREF(0x00D47800));
        FillRect(hdc, &cr, brush);
        let _ = DeleteObject(HGDIOBJ(brush.0));
        // 选中：白色实线粗边框；未选中：白色虚线边框
        let pen = if selected {
            CreatePen(PS_SOLID, 2, COLORREF(0x00FFFFFF))
        } else {
            CreatePen(PS_DASH, 1, COLORREF(0x00FFFFFF))
        };
        let old = SelectObject(hdc, HGDIOBJ(pen.0));
        let inset = 2;
        let _ = MoveToEx(hdc, inset, inset, None);
        let _ = LineTo(hdc, cr.right - inset, inset);
        let _ = LineTo(hdc, cr.right - inset, cr.bottom - inset);
        let _ = LineTo(hdc, inset, cr.bottom - inset);
        let _ = LineTo(hdc, inset, inset);
        let _ = SelectObject(hdc, old);
        let _ = DeleteObject(HGDIOBJ(pen.0));
    } else {
        let brush = CreateSolidBrush(COLORREF(0));
        FillRect(hdc, &cr, brush);
        let _ = DeleteObject(HGDIOBJ(brush.0));
    }
    let _ = EndPaint(hwnd, &ps);
}

/// 方向键微调选中按钮位置，钳制在所在屏幕内并立即持久化
unsafe fn nudge_selected(hwnd: HWND, dx: i32, dy: i32) {
    if dx == 0 && dy == 0 {
        return;
    }
    let mut r = RECT::default();
    let _ = GetWindowRect(hwnd, &mut r);
    let w = r.right - r.left;
    let h = r.bottom - r.top;
    let mut x = r.left + dx;
    let mut y = r.top + dy;

    // 钳制到所在显示器屏幕矩形内，避免移丢
    let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    let mut mi = MONITORINFOEXW::default();
    mi.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
    if GetMonitorInfoW(mon, &mut mi as *mut _ as *mut MONITORINFO).as_bool() {
        let s = mi.monitorInfo.rcMonitor;
        x = x.clamp(s.left, s.right - w);
        y = y.clamp(s.top, s.bottom - h);
    }

    let _ = SetWindowPos(
        hwnd,
        HWND(std::ptr::null_mut()),
        x,
        y,
        0,
        0,
        SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
    );
    persist_rect(hwnd);
}

unsafe fn persist_rect(hwnd: HWND) {
    let mut r = RECT::default();
    let _ = GetWindowRect(hwnd, &mut r);
    let device = map()
        .lock()
        .unwrap()
        .get(&(hwnd.0 as isize))
        .map(|e| e.device.clone());
    if let Some(device) = device {
        save_config(
            &device,
            BtnRect {
                x: r.left,
                y: r.top,
                w: r.right - r.left,
                h: r.bottom - r.top,
            },
        );
    }
}

// ===================== 窗口过程 =====================

unsafe extern "system" fn btn_proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    match msg {
        WM_ERASEBKGND => LRESULT(1),
        WM_PAINT => {
            paint_button(hwnd);
            LRESULT(0)
        }
        WM_NCHITTEST if EDIT_MODE.load(Ordering::SeqCst) => {
            LRESULT(edit_hit_test(hwnd, lp) as isize)
        }
        WM_SETCURSOR => {
            if !EDIT_MODE.load(Ordering::SeqCst) && (lp.0 as u32 & 0xFFFF) == HTCLIENT {
                if let Ok(cursor) = LoadCursorW(None, IDC_HAND) {
                    SetCursor(cursor);
                }
                LRESULT(1)
            } else {
                // 编辑模式：交给系统根据 NCHITTEST 结果显示移动/缩放光标
                DefWindowProcW(hwnd, msg, wp, lp)
            }
        }
        WM_NCLBUTTONDOWN if EDIT_MODE.load(Ordering::SeqCst) => {
            // 点击（标题区/缩放手柄）即选中该按钮，并夺取键盘焦点
            SELECTED.store(hwnd.0 as isize, Ordering::SeqCst);
            let _ = SetActiveWindow(hwnd);
            let _ = SetFocus(hwnd);
            refresh_selection();
            // 交回默认处理，保持原生拖拽/缩放
            DefWindowProcW(hwnd, msg, wp, lp)
        }
        WM_MOUSEACTIVATE if !EDIT_MODE.load(Ordering::SeqCst) => LRESULT(MA_NOACTIVATE as isize),
        WM_LBUTTONDOWN if !EDIT_MODE.load(Ordering::SeqCst) => {
            if !tick_buttons() {
                return LRESULT(0);
            }
            let paused = map()
                .lock()
                .unwrap()
                .get(&(hwnd.0 as isize))
                .map(|entry| entry.paused)
                .unwrap_or(true);
            if !paused {
                PRESSED.store(hwnd.0 as isize, Ordering::SeqCst);
                let _ = SetCapture(hwnd);
            }
            LRESULT(0)
        }
        WM_LBUTTONUP => {
            let pressed = PRESSED.swap(0, Ordering::SeqCst) == hwnd.0 as isize;
            if GetCapture() == hwnd {
                let _ = ReleaseCapture();
            }
            if pressed && !EDIT_MODE.load(Ordering::SeqCst) {
                let mut rect = RECT::default();
                let _ = GetWindowRect(hwnd, &mut rect);
                let x = lp.0 as u16 as i16 as i32;
                let y = (lp.0 >> 16) as u16 as i16 as i32;
                if x >= 0 && y >= 0 && x < rect.right - rect.left && y < rect.bottom - rect.top {
                    if !tick_buttons() {
                        return LRESULT(0);
                    }
                    let paused = map()
                        .lock()
                        .unwrap()
                        .get(&(hwnd.0 as isize))
                        .map(|entry| entry.paused)
                        .unwrap_or(true);
                    if !paused {
                        toggle_menu(hwnd);
                    }
                }
            }
            LRESULT(0)
        }
        WM_CAPTURECHANGED => {
            PRESSED.store(0, Ordering::SeqCst);
            LRESULT(0)
        }
        WM_KEYDOWN if SELECTED.load(Ordering::SeqCst) == hwnd.0 as isize => {
            let key = wp.0 as u16;
            if key == VK_ESCAPE.0 {
                SELECTED.store(0, Ordering::SeqCst);
                let _ = SetFocus(HWND(std::ptr::null_mut()));
                refresh_selection();
                LRESULT(0)
            } else {
                let fast = GetKeyState(VK_SHIFT.0 as i32) < 0;
                let step = if fast { KB_STEP_FAST } else { KB_STEP };
                let (mut dx, mut dy) = (0, 0);
                match key {
                    k if k == VK_LEFT.0 => dx = -step,
                    k if k == VK_RIGHT.0 => dx = step,
                    k if k == VK_UP.0 => dy = -step,
                    k if k == VK_DOWN.0 => dy = step,
                    _ => return DefWindowProcW(hwnd, msg, wp, lp),
                }
                nudge_selected(hwnd, dx, dy);
                LRESULT(0)
            }
        }
        WM_KILLFOCUS => {
            if SELECTED.load(Ordering::SeqCst) == hwnd.0 as isize {
                SELECTED.store(0, Ordering::SeqCst);
                refresh_selection();
            }
            DefWindowProcW(hwnd, msg, wp, lp)
        }
        WM_EXITSIZEMOVE => {
            persist_rect(hwnd);
            LRESULT(0)
        }
        WM_GETMINMAXINFO => {
            let mmi = &mut *(lp.0 as *mut MINMAXINFO);
            let dpi = GetDpiForWindow(hwnd) as i32;
            let s = (MIN_SIZE_LOGICAL as f32 * dpi as f32 / 96.0).round() as i32;
            mmi.ptMinTrackSize = POINT { x: s, y: s };
            DefWindowProcW(hwnd, msg, wp, lp)
        }
        WM_SYSCOMMAND => {
            if (wp.0 as u32 & 0xFFF0) == SC_MINIMIZE {
                // 禁止最小化（Win+D / 显示桌面）
                LRESULT(0)
            } else {
                DefWindowProcW(hwnd, msg, wp, lp)
            }
        }
        WM_WINDOWPOSCHANGING => DefWindowProcW(hwnd, msg, wp, lp),
        WM_DISPLAYCHANGE | WM_DPICHANGED | WM_SETTINGCHANGE => {
            let ctl = CONTROLLER_HWND.load(Ordering::SeqCst);
            if ctl != 0 {
                let _ = PostMessageW(HWND(ctl as *mut _), WM_REFRESH, WPARAM(0), LPARAM(0));
            }
            DefWindowProcW(hwnd, msg, wp, lp)
        }
        WM_DESTROY => LRESULT(0),
        _ => DefWindowProcW(hwnd, msg, wp, lp),
    }
}

unsafe extern "system" fn ctl_proc(hwnd: HWND, msg: u32, _wp: WPARAM, _lp: LPARAM) -> LRESULT {
    match msg {
        WM_TIMER => {
            if _wp.0 == 2 {
                let _ = KillTimer(hwnd, 2);
                REFRESH_PENDING.store(false, Ordering::SeqCst);
            }
            tick_buttons();
            LRESULT(0)
        }
        WM_TOGGLE_EDIT => {
            apply_edit_mode();
            // tick 内部统一做屏幕同步、点击穿透（编辑模式全部可点）与自愈
            tick_buttons();
            LRESULT(0)
        }
        WM_REFRESH => {
            if SetTimer(hwnd, 2, 20, None) == 0 {
                REFRESH_PENDING.store(false, Ordering::SeqCst);
                tick_buttons();
            }
            LRESULT(0)
        }
        WM_DISPLAYCHANGE | WM_SETTINGCHANGE => {
            request_refresh();
            LRESULT(0)
        }
        message if message == RegisterWindowMessageW(w!("TaskbarCreated")) => {
            request_refresh();
            LRESULT(0)
        }
        WM_DESTROY => {
            let _ = KillTimer(hwnd, 1);
            let _ = KillTimer(hwnd, 2);
            LRESULT(0)
        }
        _ => DefWindowProcW(hwnd, msg, _wp, _lp),
    }
}
