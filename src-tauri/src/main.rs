// win-start Tauri 主进程骨架

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod icon_extract;
mod scanner;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use window_vibrancy::apply_acrylic;
use std::sync::atomic::{AtomicBool, Ordering};

static MENU_READY: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn menu_ready() {
    MENU_READY.store(true, Ordering::SeqCst);
}

static FIRST_SHOW: AtomicBool = AtomicBool::new(true);

// 首次显示后强制重绘：移动 1 像素再移回，触发合成器刷新首帧
fn force_first_paint(win: &tauri::WebviewWindow) {
    if !FIRST_SHOW.swap(false, Ordering::SeqCst) { return; }
    if let Ok(size) = win.outer_size() {
        use tauri::PhysicalSize;
        let w = win.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(60));
            // 高度 -1 再恢复，强制 WebView2 重新布局并合成首帧
            let _ = w.set_size(PhysicalSize::new(size.width, size.height.saturating_sub(1)));
            std::thread::sleep(std::time::Duration::from_millis(60));
            let _ = w.set_size(PhysicalSize::new(size.width, size.height));
        });
    }
}

// 显示开始菜单：首次需等渲染就绪，避免空白
fn do_show(win: &tauri::WebviewWindow) {
    if MENU_READY.load(Ordering::SeqCst) {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.emit("menu-open", ());
        force_first_paint(win);
        return;
    }
    let w = win.clone();
    std::thread::spawn(move || {
        for _ in 0..200 {
            if MENU_READY.load(Ordering::SeqCst) {
                let _ = w.show();
                let _ = w.set_focus();
                let _ = w.emit("menu-open", ());
                force_first_paint(&w);
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(30));
        }
        // 兜底：超时也显示
        let _ = w.show();
        let _ = w.set_focus();
        let _ = w.emit("menu-open", ());
        force_first_paint(&w);
    });
}

#[tauri::command]
fn scan_apps() -> Vec<scanner::AppEntry> {
    scanner::scan_all()
}

#[tauri::command]
fn show_start_menu(window: tauri::WebviewWindow) {
    do_show(&window);
}

#[tauri::command]
fn hide_start_menu(window: tauri::WebviewWindow) {
    let _ = window.emit("menu-close", ());
    let _ = window.hide();
}

#[tauri::command]
fn open_toolbar_item(key: String) {
    use std::process::Command;
    let (program, arg): (&str, Option<&str>) = match key.as_str() {
        "explorer" => ("explorer.exe", None),
        "settings" => ("cmd", Some("/c start ms-settings:")),
        "controlPanel" => ("control.exe", None),
        "recycleBin" => ("explorer.exe", Some("shell:RecycleBinFolder")),
        "documents" => ("explorer.exe", None),
        "downloads" => ("explorer.exe", None),
        "run" => ("cmd", Some("/c start rundll32.exe shell32.dll,#61")),
        "taskManager" => ("taskmgr.exe", None),
        _ => return,
    };
    let mut cmd = Command::new(program);
    if let Some(a) = arg { cmd.arg(a); }
    if key == "documents" {
        cmd.arg(dirs::document_dir().unwrap().to_string_lossy().as_ref());
    }
    if key == "downloads" {
        let dl = dirs::download_dir().unwrap();
        cmd.arg(dl.to_string_lossy().as_ref());
    }
    let _ = cmd.spawn();
}

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

// 用 ShellExecuteW 统一打开 .lnk / exe / UWP / 协议，避免 cmd 引号问题
fn shell_open(target: &str) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let file = to_wide(target);
    let op = to_wide("open");
    unsafe {
        let h = ShellExecuteW(
            HWND(std::ptr::null_mut()),
            PCWSTR(op.as_ptr()),
            PCWSTR(file.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        );
        let code = h.0 as isize;
        // 返回值 > 32 表示成功
        if code > 32 { Ok(()) } else { Err(format!("ShellExecute failed: {}", code)) }
    }
}

#[tauri::command]
fn launch_app(path: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &path])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn launch_uwp(app_id: String) -> Result<(), String> {
    // 与 Electron 版一致：协议直开，UWP/商店应用交给 explorer.exe shell:AppsFolder
    if app_id.contains("://") {
        return shell_open(&app_id);
    }
    let target = format!("shell:AppsFolder\\{}", app_id);
    std::process::Command::new("explorer.exe")
        .arg(&target)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// 解析 .lnk 快捷方式，返回目标 exe/文件的完整路径
fn resolve_lnk_target(lnk_path: &str) -> Option<String> {
    use windows::core::{GUID, Interface, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, IPersistFile, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED, STGM_READ,
    };
    use windows::Win32::UI::Shell::IShellLinkW;
    // CLSID_ShellLink = {00021401-0000-0000-C000-000000000046}
    const CLSID_SHELL_LINK: GUID = GUID {
        data1: 0x00021401, data2: 0, data3: 0,
        data4: [0xC0, 0, 0, 0, 0, 0, 0, 0x46],
    };
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let shell: IShellLinkW =
            CoCreateInstance(&CLSID_SHELL_LINK, None, CLSCTX_INPROC_SERVER).ok()?;
        let pf: IPersistFile = shell.cast().ok()?;
        let wide = to_wide(lnk_path);
        pf.Load(PCWSTR(wide.as_ptr()), STGM_READ).ok()?;
        let mut buf = [0u16; 260];
        // dwFlags=SLGP_SHORTPATH(1)
        shell
            .GetPath(&mut buf, std::ptr::null_mut(), 1)
            .ok()?;
        let len = buf.iter().position(|&c| c == 0).unwrap_or(0);
        let target = String::from_utf16_lossy(&buf[..len]);
        if target.is_empty() { None } else { Some(target) }
    }
}

#[tauri::command]
fn show_in_folder(path: String) -> Result<(), String> {
    // 若是 .lnk，先解析到目标 exe（安装目录）；解析失败则回退到快捷方式本身
    let target = if path.to_lowercase().ends_with(".lnk") {
        resolve_lnk_target(&path).unwrap_or(path)
    } else {
        path
    };
    std::process::Command::new("explorer.exe")
        .arg(format!("/select,{}", target))
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn uninstall_program() -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/c", "start", "control", "appwiz.cpl"])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct AvatarInfo {
    path: String,
    #[serde(rename = "cropX")]
    crop_x: Option<f64>,
    #[serde(rename = "cropY")]
    crop_y: Option<f64>,
    scale: Option<f64>,
    #[serde(rename = "imgW")]
    img_w: Option<f64>,
    #[serde(rename = "imgH")]
    img_h: Option<f64>,
    #[serde(rename = "cropSize")]
    crop_size: Option<f64>,
}

#[tauri::command]
fn get_user_avatar() -> Option<AvatarInfo> {
    let dir = dirs::data_dir()?.join("win-start");
    for (i, name) in ["user-avatar.png", "user-avatar.gif"].iter().enumerate() {
        let p = dir.join(name);
        if p.exists() {
            let crop_path = dir.join("avatar-crop.json");
            let (mut cx, mut cy, mut sc, mut iw, mut ih, mut cs) = (None, None, None, None, None, None);
            if let Ok(txt) = std::fs::read_to_string(&crop_path) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&txt) {
                    cx = v.get("x").and_then(|x| x.as_f64());
                    cy = v.get("y").and_then(|x| x.as_f64());
                    sc = v.get("scale").and_then(|x| x.as_f64());
                    iw = v.get("imgW").and_then(|x| x.as_f64());
                    ih = v.get("imgH").and_then(|x| x.as_f64());
                    cs = v.get("cropSize").and_then(|x| x.as_f64());
                }
            }
            if i == 0 { cx = None; cy = None; sc = None; iw = None; ih = None; cs = None; }
            return Some(AvatarInfo {
                path: p.to_string_lossy().to_string(),
                crop_x: cx, crop_y: cy, scale: sc, img_w: iw, img_h: ih, crop_size: cs,
            });
        }
    }
    None
}

#[tauri::command]
async fn select_user_avatar(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app.dialog().file().add_filter("图片", &["png", "jpg", "jpeg", "gif", "bmp"]).blocking_pick_file();
    let path = file.and_then(|f| f.into_path().ok()).map(|p| p.to_string_lossy().to_string());
    if let Some(p) = path {
        use tauri::WebviewUrl;
        use tauri::WebviewWindowBuilder;
        // 存到主进程状态，渲染窗通过 get_crop_image 取
        *app.state::<CropImagePath>().0.lock().unwrap() = p.clone();
        let win = WebviewWindowBuilder::new(&app, "avatar-crop", WebviewUrl::External("http://localhost:5173/#/avatar-crop".parse().unwrap()))
            .title("裁剪用户头像")
            .inner_size(380.0, 460.0)
            .resizable(false)
            .decorations(true)
            .skip_taskbar(true)
            .build()
            .map_err(|e| e.to_string())?;
        let _ = win;
    }
    Ok(None) // 裁剪完成后由裁剪窗自己调 set_user_avatar
}

#[tauri::command]
fn set_user_avatar(path: String) -> Result<Option<String>, String> {
    let dir = dirs::data_dir().ok_or("no data dir")?.join("win-start");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let ext = std::path::Path::new(&path).extension().and_then(|s| s.to_str()).unwrap_or("png");
    let dest = dir.join(format!("user-avatar.{}", ext));
    std::fs::copy(&path, &dest).map_err(|e| e.to_string())?;
    Ok(Some(dest.to_string_lossy().to_string()))
}

use std::sync::Mutex;

struct CropImagePath(Mutex<String>);

#[tauri::command]
fn get_crop_image(state: tauri::State<CropImagePath>) -> String {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn save_gif_avatar(app: tauri::AppHandle, data_url: String, crop: Option<serde_json::Value>) -> Result<(), String> {
    use base64::Engine;
    let dir = dirs::data_dir().ok_or("no data dir")?.join("win-start");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(dir.join("user-avatar.png"));
    let dest = dir.join("user-avatar.gif");
    let b = data_url.strip_prefix("data:image/gif;base64,").unwrap_or(&data_url);
    let bytes = base64::engine::general_purpose::STANDARD.decode(b).map_err(|e| e.to_string())?;
    std::fs::write(&dest, bytes).map_err(|e| e.to_string())?;
    // 保存裁剪变换
    if let Some(c) = crop {
        let _ = std::fs::write(dir.join("avatar-crop.json"), c.to_string());
    }
    let _ = app.emit("avatar:updated", ());
    Ok(())
}

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let ext = std::path::Path::new(&path).extension().and_then(|s| s.to_str()).unwrap_or("png");
    let mime = match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        _ => "image/png",
    };
    Ok(format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[tauri::command]
fn save_cropped_avatar(app: tauri::AppHandle, base64: String) -> Result<(), String> {
    use base64::Engine;
    let dir = dirs::data_dir().ok_or("no data dir")?.join("win-start");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // 清掉旧的 gif/png
    let _ = std::fs::remove_file(dir.join("user-avatar.gif"));
    let dest = dir.join("user-avatar.png");
    let b = base64.strip_prefix("data:image/png;base64,").unwrap_or(&base64);
    let bytes = base64::engine::general_purpose::STANDARD.decode(b).map_err(|e| e.to_string())?;
    std::fs::write(&dest, bytes).map_err(|e| e.to_string())?;
    let _ = app.emit("avatar:updated", ());
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![
            scan_apps, show_start_menu, hide_start_menu, menu_ready, open_toolbar_item,
            launch_app, launch_uwp,
            show_in_folder, uninstall_program,
            get_user_avatar, select_user_avatar, set_user_avatar, save_cropped_avatar,
            read_file_base64, get_crop_image, save_gif_avatar
        ])
        .setup(|app| {
            app.manage(CropImagePath(Mutex::new(String::new())));
            let win = app.get_webview_window("main").unwrap();

            let _ = apply_acrylic(&win, Some((32, 32, 32, 40)));

            // 去掉系统"标题栏和窗口边框强调色"导致的一圈彩色边框
            #[cfg(target_os = "windows")]
            if let Ok(hwnd_t) = win.hwnd() {
                use windows::Win32::Foundation::HWND;
                use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_VISIBLE_FRAME_BORDER_THICKNESS};
                // 用裸指针重建本 crate 版本的 HWND，避免 windows crate 版本不一致
                let hwnd = HWND(hwnd_t.0);
                unsafe {
                    // DWMWA_BORDER_COLOR = 34, DWMWA_COLOR_NONE = 0xFFFFFFFE
                    let none: u32 = 0xFFFFFFFE;
                    let _ = DwmSetWindowAttribute(
                        hwnd, DWMWA_BORDER_COLOR,
                        &none as *const u32 as *const _,
                        std::mem::size_of::<u32>() as u32,
                    );
                    // DWMWA_CAPTION_COLOR = 35 也设为无
                    let _ = DwmSetWindowAttribute(
                        hwnd, DWMWA_CAPTION_COLOR,
                        &none as *const u32 as *const _,
                        std::mem::size_of::<u32>() as u32,
                    );
                    // DWMWA_VISIBLE_FRAME_BORDER_THICKNESS = 38, 厚度 0
                    let thickness: i32 = 0;
                    let _ = DwmSetWindowAttribute(
                        hwnd, DWMWA_VISIBLE_FRAME_BORDER_THICKNESS,
                        &thickness as *const i32 as *const _,
                        std::mem::size_of::<i32>() as u32,
                    );
                }
            }

            // WebView2 默认背景设为透明，避免窗口显示瞬间白闪
            let _ = win.with_webview(|webview| {
                use webview2_com::Microsoft::Web::WebView2::Win32::{
                    ICoreWebView2Controller2, COREWEBVIEW2_COLOR,
                };
                use windows61::core::Interface;
                unsafe {
                    let ctrl = webview.controller();
                    if let Ok(c2) = ctrl.cast::<ICoreWebView2Controller2>() {
                        let mut transparent = COREWEBVIEW2_COLOR { A: 0, R: 0, G: 0, B: 0 };
                        let _ = c2.DefaultBackgroundColor(&mut transparent);
                    }
                }
            });

            // 启动时把窗口放到屏幕左下角
            if let Ok(Some(monitor)) = win.current_monitor() {
                if let Ok(size) = win.outer_size() {
                    let work = monitor.work_area();
                    let x = work.position.x;
                    let y = work.position.y + work.size.height as i32 - size.height as i32;
                    let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
                }
            }

            let win_clone = win.clone();
            win.on_window_event(move |event| {
                if let WindowEvent::Focused(false) = event {
                    let _ = win_clone.emit("menu-close", ());
                    let _ = win_clone.hide();
                }
            });

            // 托盘菜单
            let open_item = MenuItem::with_id(app, "open", "打开开始菜单", true, None::<&str>)?;
            let shortcut_item = MenuItem::with_id(app, "shortcut", "快捷键设置", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[&open_item, &sep, &shortcut_item, &sep, &quit_item],
            )?;

            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Win10 开始菜单")
                .menu(&menu)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(win) = tray.app_handle().get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                do_show(&win);
                            }
                        }
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // Alt+W（注册失败不阻塞启动）
            let win_clone = win.clone();
            let builder = tauri_plugin_global_shortcut::Builder::new().with_shortcut("Alt+W");
            match builder {
                Ok(b) => {
                    let plugin = b
                        .with_handler(move |_app, _shortcut, event| {
                            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                                if win_clone.is_visible().unwrap_or(false) {
                                    let _ = win_clone.hide();
                                } else {
                                    do_show(&win_clone);
                                }
                            }
                        })
                        .build();
                    let _ = app.handle().plugin(plugin);
                }
                Err(e) => eprintln!("[Warn] Alt+W 注册失败: {}", e),
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run()
}
