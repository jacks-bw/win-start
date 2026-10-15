// win-start Tauri 主进程骨架

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod icon_extract;
mod launch_button;
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
// 样式设置窗口打开时，主菜单失焦不自动隐藏
static MENU_BLOCKED: AtomicBool = AtomicBool::new(false);
// 设置窗口打开前，主菜单是否本就可见（用于设置关闭后恢复）
static SETTINGS_MENU_WAS_OPEN: AtomicBool = AtomicBool::new(false);

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
pub(crate) fn do_show(win: &tauri::WebviewWindow) {
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
async fn scan_apps() -> Vec<scanner::AppEntry> {
    // 扫描含 PowerShell 调用与大量图标提取（CPU 密集），丢到阻塞线程池，
    // 避免同步 command 卡死 webview 主线程，导致设置等子窗口的 loading 不结束。
    tauri::async_runtime::spawn_blocking(scanner::scan_all)
        .await
        .unwrap_or_default()
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
    let mut cmd = hidden_command(program);
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

// 构造一个隐藏控制台窗口的子进程：release 构建是 GUI 子系统，直接 spawn
// cmd / powershell / control 等控制台程序会强制弹一个黑窗，统一加 CREATE_NO_WINDOW。
fn hidden_command(program: &str) -> std::process::Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let mut cmd = std::process::Command::new(program);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
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
    hidden_command("cmd")
        .args(["/c", "start", "", &path])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn launch_uwp(app_id: String) -> Result<(), String> {
    // 协议直开，UWP/商店应用交给 explorer.exe shell:AppsFolder
    if app_id.contains("://") {
        return shell_open(&app_id);
    }
    let target = format!("shell:AppsFolder\\{}", app_id);
    hidden_command("explorer.exe")
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
    hidden_command("explorer.exe")
        .arg(format!("/select,{}", target))
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn uninstall_program() -> Result<(), String> {
    hidden_command("cmd")
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
        // 存到主进程状态，裁剪窗通过 get_crop_image 取
        *app.state::<CropImagePath>().0.lock().unwrap() = p.clone();
        // 已存在裁剪窗：更新路径后重新加载页面并置前，避免重复创建失败
        if let Some(existing) = app.get_webview_window("avatar-crop") {
            let _ = existing.eval("location.reload()");
            let _ = existing.show();
            let _ = existing.set_focus();
            return Ok(None);
        }
        // 等待文件对话框模态循环完全退出，再创建窗口，避免创建被吞
        let app2 = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(120));
            match create_avatar_crop_window(&app2) {
                Ok(win) => {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
                Err(e) => eprintln!("[avatar] 裁剪窗创建失败: {}", e),
            }
        });
    }
    Ok(None) // 裁剪完成后由裁剪窗自己调 set_user_avatar
}

// ===================== 头像设置窗口 =====================
#[tauri::command]
async fn open_avatar_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::WebviewUrl;
    use tauri::WebviewWindowBuilder;
    if let Some(win) = app.get_webview_window("avatar-settings") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    let win = WebviewWindowBuilder::new(&app, "avatar-settings", WebviewUrl::App("index.html#/avatar-settings".into()))
        .title("用户头像")
        .inner_size(340.0, 400.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .skip_taskbar(true)
        .center()
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;
    framelize_window(&win);
    let _ = win.set_focus();
    Ok(())
}

#[tauri::command]
fn close_avatar_settings_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("avatar-settings") {
        let _ = win.close();
    }
}

// 清空用户头像（删除 png/gif 与裁剪信息）
#[tauri::command]
fn clear_user_avatar(app: tauri::AppHandle) -> Result<(), String> {
    let dir = dirs::data_dir().ok_or("no data dir")?.join("win-start");
    let _ = std::fs::remove_file(dir.join("user-avatar.png"));
    let _ = std::fs::remove_file(dir.join("user-avatar.gif"));
    let _ = std::fs::remove_file(dir.join("avatar-crop.json"));
    let _ = app.emit("avatar:updated", ());
    Ok(())
}

fn create_avatar_crop_window(app: &tauri::AppHandle) -> Result<tauri::WebviewWindow, String> {
    use tauri::WebviewUrl;
    use tauri::WebviewWindowBuilder;
    let win = WebviewWindowBuilder::new(app, "avatar-crop", WebviewUrl::App("index.html#/avatar-crop".into()))
        .title("裁剪用户头像")
        .inner_size(380.0, 480.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .skip_taskbar(true)
        .center()
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;
    // 与其他独立窗口一致：毛玻璃、去强调色边框、延迟重试透明背景
    framelize_window(&win);
    Ok(win)
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

// ===================== 头像暂存（头像设置窗点"保存"后才生效） =====================
fn read_avatar_info(png_name: &str, gif_name: &str, crop_name: &str) -> Option<AvatarInfo> {
    let dir = dirs::data_dir()?.join("win-start");
    for (i, name) in [png_name, gif_name].iter().enumerate() {
        let p = dir.join(name);
        if p.exists() {
            let crop_path = dir.join(crop_name);
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
fn get_staged_avatar() -> Option<AvatarInfo> {
    read_avatar_info("avatar-staged.png", "avatar-staged.gif", "avatar-staged-crop.json")
}

#[tauri::command]
fn stage_cropped_avatar(app: tauri::AppHandle, base64: String) -> Result<(), String> {
    use base64::Engine;
    let dir = dirs::data_dir().ok_or("no data dir")?.join("win-start");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(dir.join("avatar-staged.gif"));
    let _ = std::fs::remove_file(dir.join("avatar-staged-crop.json"));
    let dest = dir.join("avatar-staged.png");
    let b = base64.strip_prefix("data:image/png;base64,").unwrap_or(&base64);
    let bytes = base64::engine::general_purpose::STANDARD.decode(b).map_err(|e| e.to_string())?;
    std::fs::write(&dest, bytes).map_err(|e| e.to_string())?;
    let _ = app.emit("avatar-staged", ());
    if let Some(w) = app.get_webview_window("avatar-settings") {
        let _ = w.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn stage_gif_avatar(app: tauri::AppHandle, data_url: String, crop: Option<serde_json::Value>) -> Result<(), String> {
    use base64::Engine;
    let dir = dirs::data_dir().ok_or("no data dir")?.join("win-start");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(dir.join("avatar-staged.png"));
    let dest = dir.join("avatar-staged.gif");
    let b = data_url.strip_prefix("data:image/gif;base64,").unwrap_or(&data_url);
    let bytes = base64::engine::general_purpose::STANDARD.decode(b).map_err(|e| e.to_string())?;
    std::fs::write(&dest, bytes).map_err(|e| e.to_string())?;
    if let Some(c) = crop {
        let _ = std::fs::write(dir.join("avatar-staged-crop.json"), c.to_string());
    }
    let _ = app.emit("avatar-staged", ());
    if let Some(w) = app.get_webview_window("avatar-settings") {
        let _ = w.set_focus();
    }
    Ok(())
}

#[tauri::command]
fn close_avatar_crop_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("avatar-crop") {
        let _ = win.close();
    }
    // 取消裁剪后把焦点交回头像设置窗
    if let Some(w) = app.get_webview_window("avatar-settings") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn commit_avatar(app: tauri::AppHandle, clear: bool) -> Result<(), String> {
    let dir = dirs::data_dir().ok_or("no data dir")?.join("win-start");
    let staged_png = dir.join("avatar-staged.png");
    let staged_gif = dir.join("avatar-staged.gif");
    let staged_crop = dir.join("avatar-staged-crop.json");
    let final_png = dir.join("user-avatar.png");
    let final_gif = dir.join("user-avatar.gif");
    let final_crop = dir.join("avatar-crop.json");
    if clear {
        let _ = std::fs::remove_file(&final_png);
        let _ = std::fs::remove_file(&final_gif);
        let _ = std::fs::remove_file(&final_crop);
    } else if staged_png.exists() {
        let _ = std::fs::remove_file(&final_png);
        let _ = std::fs::remove_file(&final_gif);
        let _ = std::fs::remove_file(&final_crop);
        std::fs::rename(&staged_png, &final_png).map_err(|e| e.to_string())?;
    } else if staged_gif.exists() {
        let _ = std::fs::remove_file(&final_png);
        let _ = std::fs::remove_file(&final_gif);
        let _ = std::fs::remove_file(&final_crop);
        std::fs::rename(&staged_gif, &final_gif).map_err(|e| e.to_string())?;
        if staged_crop.exists() {
            let _ = std::fs::rename(&staged_crop, &final_crop);
        }
    }
    // 清理暂存
    let _ = std::fs::remove_file(&staged_png);
    let _ = std::fs::remove_file(&staged_gif);
    let _ = std::fs::remove_file(&staged_crop);
    let _ = app.emit("avatar:updated", ());
    Ok(())
}

#[tauri::command]
fn discard_staged_avatar() -> Result<(), String> {
    let dir = dirs::data_dir().ok_or("no data dir")?.join("win-start");
    let _ = std::fs::remove_file(dir.join("avatar-staged.png"));
    let _ = std::fs::remove_file(dir.join("avatar-staged.gif"));
    let _ = std::fs::remove_file(dir.join("avatar-staged-crop.json"));
    Ok(())
}

// ===================== 磁贴布局持久化 =====================
fn data_dir() -> Result<std::path::PathBuf, String> {
    let d = dirs::data_dir().map(|d| d.join("win-start")).ok_or("no data dir")?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

// ===================== 通用设置（快捷键 / 磁贴透明度） =====================
#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct AppSettings {
    hotkey: String,
    #[serde(rename = "tileOpacity")]
    tile_opacity: f32,
    /// 透明度是否包含设置了壁纸的磁贴
    #[serde(default = "default_true", rename = "includeWallpaperOpacity")]
    include_wallpaper_opacity: bool,
    /// 自定义软件主题色（#rrggbb），None 表示跟随系统
    #[serde(default, rename = "themeColor")]
    theme_color: Option<String>,
    /// 自定义高亮颜色（#rrggbb），None 表示跟随系统
    #[serde(default, rename = "highlightColor")]
    highlight_color: Option<String>,
    /// 开始菜单壁纸（绝对路径），None 表示未设置
    #[serde(default, rename = "wallpaperPath")]
    wallpaper_path: Option<String>,
    /// 壁纸压暗程度 0.0-1.0，默认 0.5
    #[serde(default = "default_wallpaper_darken", rename = "wallpaperDarken")]
    wallpaper_darken: f32,
    /// 程序列表 / 工具栏背景深度 0.0-1.0，默认 0.4
    #[serde(default = "default_panel_alpha", rename = "panelAlpha")]
    panel_alpha: f32,
    /// 磁贴覆盖区域的壁纸毛玻璃模糊强度（px），0 表示关闭，默认 20
    #[serde(default = "default_tile_blur", rename = "tileBlur")]
    tile_blur: f32,
}

/// 校验颜色为 #rrggbb
fn valid_hex_color(c: &str) -> bool {
    let b = c.as_bytes();
    b.len() == 7
        && b[0] == b'#'
        && b[1..].iter().all(|x| x.is_ascii_hexdigit())
}

fn default_true() -> bool {
    true
}

fn default_wallpaper_darken() -> f32 {
    0.5
}

fn default_panel_alpha() -> f32 {
    0.4
}

fn default_tile_blur() -> f32 {
    20.0
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            hotkey: "Alt+W".to_string(),
            tile_opacity: 0.9,
            include_wallpaper_opacity: true,
            theme_color: None,
            highlight_color: None,
            wallpaper_path: None,
            wallpaper_darken: 0.5,
            panel_alpha: 0.4,
            tile_blur: 20.0,
        }
    }
}

struct AppSettingsState(std::sync::Mutex<AppSettings>);

fn load_settings() -> AppSettings {
    let Some(p) = data_dir().ok().map(|d| d.join("settings.json")) else {
        return AppSettings::default();
    };
    std::fs::read_to_string(&p)
        .ok()
        .and_then(|s| serde_json::from_str::<AppSettings>(&s).ok())
        .unwrap_or_default()
}

fn save_settings(s: &AppSettings) -> Result<(), String> {
    let p = data_dir()?.join("settings.json");
    std::fs::write(&p, serde_json::to_string(s).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_settings(state: tauri::State<'_, AppSettingsState>) -> AppSettings {
    state.0.lock().unwrap().clone()
}

#[tauri::command]
fn set_hotkey(app: tauri::AppHandle, state: tauri::State<'_, AppSettingsState>, hotkey: String) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;
    let trimmed = hotkey.trim();
    if !trimmed.is_empty() {
        let sc: tauri_plugin_global_shortcut::Shortcut =
            trimmed.parse().map_err(|e| format!("快捷键无效：{e}"))?;
        gs.register(sc).map_err(|e| format!("该快捷键已被占用或无效：{e}"))?;
    }
    let mut s = state.0.lock().unwrap();
    s.hotkey = trimmed.to_string();
    save_settings(&s)
}

#[tauri::command]
fn get_tile_opacity(state: tauri::State<'_, AppSettingsState>) -> f32 {
    state.0.lock().unwrap().tile_opacity
}

#[tauri::command]
fn set_tile_opacity(app: tauri::AppHandle, state: tauri::State<'_, AppSettingsState>, opacity: f32) -> Result<f32, String> {
    let v = opacity.clamp(0.1, 1.0);
    {
        let mut s = state.0.lock().unwrap();
        s.tile_opacity = v;
        save_settings(&s)?;
    }
    let _ = app.emit("tile-opacity-changed", v);
    Ok(v)
}

#[tauri::command]
fn set_include_wallpaper_opacity(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppSettingsState>,
    enable: bool,
) -> Result<(), String> {
    {
        let mut s = state.0.lock().unwrap();
        s.include_wallpaper_opacity = enable;
        save_settings(&s)?;
    }
    let _ = app.emit("tile-opacity-include-changed", enable);
    Ok(())
}

#[tauri::command]
fn set_theme_color(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppSettingsState>,
    color: Option<String>,
) -> Result<(), String> {
    if let Some(ref c) = color {
        if !valid_hex_color(c) {
            return Err("颜色格式无效，应为 #RRGGBB".to_string());
        }
    }
    {
        let mut s = state.0.lock().unwrap();
        s.theme_color = color.clone();
        save_settings(&s)?;
    }
    let _ = app.emit("theme-color-changed", color);
    Ok(())
}

#[tauri::command]
fn set_highlight_color(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppSettingsState>,
    color: Option<String>,
) -> Result<(), String> {
    if let Some(ref c) = color {
        if !valid_hex_color(c) {
            return Err("颜色格式无效，应为 #RRGGBB".to_string());
        }
    }
    {
        let mut s = state.0.lock().unwrap();
        s.highlight_color = color.clone();
        save_settings(&s)?;
    }
    let _ = app.emit("highlight-color-changed", color);
    Ok(())
}

// ===================== 开始菜单壁纸 =====================
/// 复制用户选择的静态图片到数据目录作为壁纸；仅支持静态图。
#[tauri::command]
fn set_wallpaper(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppSettingsState>,
    path: String,
) -> Result<String, String> {
    let src = std::path::Path::new(&path);
    if !src.exists() {
        return Err("图片文件不存在".to_string());
    }
    let ext = src
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("png")
        .to_lowercase();
    if ext == "gif" {
        return Err("壁纸仅支持静态图片（png/jpg/jpeg/bmp/webp）".to_string());
    }
    let ext = match ext.as_str() {
        "jpg" | "jpeg" | "png" | "bmp" | "webp" => ext,
        _ => "png".to_string(),
    };
    let dir = data_dir()?;
    // 清理旧壁纸
    for old_ext in ["png", "jpg", "jpeg", "bmp", "webp"] {
        let _ = std::fs::remove_file(dir.join(format!("wallpaper.{old_ext}")));
    }
    let dest = dir.join(format!("wallpaper.{ext}"));
    std::fs::copy(src, &dest).map_err(|e| format!("复制壁纸失败：{e}"))?;
    let dest_str = dest.to_string_lossy().to_string();
    {
        let mut s = state.0.lock().unwrap();
        s.wallpaper_path = Some(dest_str.clone());
        save_settings(&s)?;
    }
    let _ = app.emit("wallpaper-changed", dest_str.clone());
    Ok(dest_str)
}

#[tauri::command]
fn clear_wallpaper(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppSettingsState>,
) -> Result<(), String> {
    let old = state.0.lock().unwrap().wallpaper_path.clone();
    if let Some(p) = old {
        let _ = std::fs::remove_file(&p);
    }
    {
        let mut s = state.0.lock().unwrap();
        s.wallpaper_path = None;
        save_settings(&s)?;
    }
    let _ = app.emit("wallpaper-changed", ());
    Ok(())
}

#[tauri::command]
fn set_wallpaper_darken(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppSettingsState>,
    v: f32,
) -> Result<f32, String> {
    let v = v.clamp(0.0, 1.0);
    {
        let mut s = state.0.lock().unwrap();
        s.wallpaper_darken = v;
        save_settings(&s)?;
    }
    let _ = app.emit("wallpaper-darken-changed", v);
    Ok(v)
}

#[tauri::command]
fn set_panel_alpha(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppSettingsState>,
    v: f32,
) -> Result<f32, String> {
    let v = v.clamp(0.0, 1.0);
    {
        let mut s = state.0.lock().unwrap();
        s.panel_alpha = v;
        save_settings(&s)?;
    }
    let _ = app.emit("panel-alpha-changed", v);
    Ok(v)
}

#[tauri::command]
fn set_tile_blur(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppSettingsState>,
    v: f32,
) -> Result<f32, String> {
    let v = v.clamp(0.0, 100.0);
    {
        let mut s = state.0.lock().unwrap();
        s.tile_blur = v;
        save_settings(&s)?;
    }
    let _ = app.emit("tile-blur-changed", v);
    Ok(v)
}

// ===================== 系统强调色 =====================
/// 读取注册表中的系统强调色（HKCU\Software\Microsoft\Windows\DWM 的 AccentColor，
/// 格式为 0xAABBGGRR），返回 #RRGGBB；失败时回退为 Windows 蓝。
/// 直接用 RegGetValueW，避免 spawn reg.exe 子进程导致控制台窗口闪现。
#[tauri::command]
fn get_accent_color() -> String {
    use windows::core::PCWSTR;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};

    let subkey: Vec<u16> = "Software\\Microsoft\\Windows\\DWM".encode_utf16().chain(std::iter::once(0)).collect();
    let value: Vec<u16> = "AccentColor".encode_utf16().chain(std::iter::once(0)).collect();

    let mut data: u32 = 0;
    let mut size: u32 = std::mem::size_of::<u32>() as u32;
    let ok = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            PCWSTR(subkey.as_ptr()),
            PCWSTR(value.as_ptr()),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut data as *mut u32 as *mut _),
            Some(&mut size),
        )
    }
    .is_ok();

    if !ok || data == 0 {
        return "#0078d7".to_string();
    }
    let r = (data & 0xff) as u8;
    let g = ((data >> 8) & 0xff) as u8;
    let b = ((data >> 16) & 0xff) as u8;
    format!("#{:02x}{:02x}{:02x}", r, g, b)
}

// ===================== 开机自启 =====================
#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enable: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let al = app.autolaunch();
    if enable {
        al.enable().map_err(|e| e.to_string())
    } else {
        al.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn load_tile_layout() -> Option<serde_json::Value> {
    let p = data_dir().ok()?.join("tile-layout.json");
    let s = std::fs::read_to_string(p).ok()?;
    serde_json::from_str(&s).ok()
}

#[tauri::command]
fn save_tile_layout(layout: serde_json::Value) -> Result<(), String> {
    let p = data_dir()?.join("tile-layout.json");
    std::fs::write(&p, layout.to_string()).map_err(|e| e.to_string())
}

// ===================== 背景图片选择 / 读写 =====================
#[tauri::command]
async fn select_image(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app
        .dialog()
        .file()
        .add_filter("图片", &["png", "jpg", "jpeg", "gif", "bmp", "webp"])
        .blocking_pick_file();
    Ok(file.and_then(|f| f.into_path().ok()).map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
async fn select_svg(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app.dialog().file().add_filter("SVG 图标", &["svg"]).blocking_pick_file();
    Ok(file.and_then(|f| f.into_path().ok()).map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn read_image_base64(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let ext = std::path::Path::new(&path).extension().and_then(|s| s.to_str()).unwrap_or("png").to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    };
    Ok(format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[tauri::command]
fn save_image(base64: String, file_name: String) -> Result<String, String> {
    use base64::Engine;
    let dir = data_dir()?.join("tile-backgrounds");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // data:image/<ext>;base64,...
    let (mime, data_part) = {
        let trimmed = base64.strip_prefix("data:").unwrap_or(&base64);
        if let Some(semi) = trimmed.find(';') {
            let mime = &trimmed[..semi];
            let rest = &trimmed[semi..];
            let b64 = rest.strip_prefix(";base64,").unwrap_or("");
            (mime.to_string(), b64.to_string())
        } else {
            ("image/png".to_string(), trimmed.to_string())
        }
    };
    let ext = match mime.as_str() {
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        _ => "png",
    };
    let bytes = base64::engine::general_purpose::STANDARD.decode(data_part).map_err(|e| e.to_string())?;
    let safe_name = file_name.replace(|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_', "_");
    let dest = dir.join(format!("{}.{}", safe_name, ext));
    std::fs::write(&dest, bytes).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

// ===================== 磁贴 / 分组样式窗口 =====================
struct StyleTargets {
    tile: Mutex<String>,
    group: Mutex<String>,
}

fn open_style_window(
    app: &tauri::AppHandle,
    label: &str,
    hash: &str,
    select_event: &str,
    target: &str,
) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    // 已存在则聚焦并切换目标
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.set_focus();
        let _ = win.emit(select_event, target);
        return Ok(());
    }
    let url = format!("index.html#{}", hash);
    let win = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(if label == "tile-style" { "磁贴样式" } else { "分组背景" })
        .inner_size(560.0, 640.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .skip_taskbar(true)
        .center()
        .visible(true)
        .build();
    let win = win.map_err(|e| e.to_string())?;
    // 先在隐藏状态下做毛玻璃 / 去边框
    let _ = window_vibrancy::apply_acrylic(&win, Some((32, 32, 32, 40)));
    #[cfg(target_os = "windows")]
    if let Ok(hwnd_t) = win.hwnd() {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_VISIBLE_FRAME_BORDER_THICKNESS};
        let hwnd = HWND(hwnd_t.0);
        unsafe {
            let none: u32 = 0xFFFFFFFE;
            let _ = DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, &none as *const u32 as *const _, 4);
            let _ = DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, &none as *const u32 as *const _, 4);
            let thickness: i32 = 0;
            let _ = DwmSetWindowAttribute(hwnd, DWMWA_VISIBLE_FRAME_BORDER_THICKNESS, &thickness as *const i32 as *const _, 4);
        }
    }
    // 运行时创建的窗口立即取 controller 可能尚未就绪，
    // 延迟到主线程设置 WebView2 透明背景，避免白屏
    let win_for_bg = win.clone();
    std::thread::spawn(move || {
        for _ in 0..8 {
            std::thread::sleep(std::time::Duration::from_millis(200));
            let w = win_for_bg.clone();
            let w2 = w.clone();
            if w
                .run_on_main_thread(move || {
                    let _ = w2.with_webview(|webview| {
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
                })
                .is_ok()
            {
                break;
            }
        }
    });
    // 关闭时解锁主菜单并通知主窗口刷新
    {
        let app2 = app.clone();
        let label2 = label.to_string();
        win.on_window_event(move |event| {
            if let tauri::WindowEvent::Destroyed = event {
                MENU_BLOCKED.store(false, Ordering::SeqCst);
                let _ = app2.emit("menu-blocked", false);
                let _ = app2.emit("layout-updated", ());
                let _ = label2;
            }
        });
    }
    MENU_BLOCKED.store(true, Ordering::SeqCst);
    let _ = app.emit("menu-blocked", true);
    Ok(())
}

#[tauri::command]
async fn open_tile_style_window(app: tauri::AppHandle, state: tauri::State<'_, StyleTargets>, tile_id: String) -> Result<(), String> {
    *state.tile.lock().unwrap() = tile_id.clone();
    open_style_window(&app, "tile-style", "/tile-style", "tile-style:select", &tile_id)
}

#[tauri::command]
fn get_tile_style_target(state: tauri::State<StyleTargets>) -> String {
    state.tile.lock().unwrap().clone()
}

#[tauri::command]
fn close_tile_style_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("tile-style") {
        let _ = win.close();
    }
    MENU_BLOCKED.store(false, Ordering::SeqCst);
    let _ = app.emit("menu-blocked", false);
    let _ = app.emit("layout-updated", ());
}

#[tauri::command]
async fn open_group_style_window(app: tauri::AppHandle, state: tauri::State<'_, StyleTargets>, group_id: String) -> Result<(), String> {
    *state.group.lock().unwrap() = group_id.clone();
    open_style_window(&app, "group-style", "/group-style", "group-style:select", &group_id)
}

#[tauri::command]
fn get_group_style_target(state: tauri::State<StyleTargets>) -> String {
    state.group.lock().unwrap().clone()
}

#[tauri::command]
fn close_group_style_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("group-style") {
        let _ = win.close();
    }
    MENU_BLOCKED.store(false, Ordering::SeqCst);
    let _ = app.emit("menu-blocked", false);
    let _ = app.emit("layout-updated", ());
}

// 窗口边缘缩放期间屏蔽失焦自动隐藏（resize 系统模态循环会导致短暂失焦）
#[tauri::command]
fn set_resize_blocked(blocked: bool) {
    MENU_BLOCKED.store(blocked, Ordering::SeqCst);
}

#[tauri::command]
fn notify_layout_updated(app: tauri::AppHandle) {
    let _ = app.emit("layout-updated", ());
}

// ===================== 设置窗口 =====================
async fn create_settings_window(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.set_focus();
        return Ok(());
    }

    // 个性化设置期间自动打开主菜单做同步预览（不可点击，由 menu-blocked 遮罩控制）
    let main = app.get_webview_window("main");
    let was_open = main
        .as_ref()
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    SETTINGS_MENU_WAS_OPEN.store(was_open, Ordering::SeqCst);
    // 先屏蔽失焦自动隐藏，再显示主菜单（不抢焦点，焦点留给设置窗口）
    MENU_BLOCKED.store(true, Ordering::SeqCst);
    let _ = app.emit("menu-blocked", true);
    if let Some(main) = &main {
        if !was_open {
            let _ = main.show();
            let _ = main.emit("menu-open", ());
        }
    }

    let win = WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("index.html#/settings".into()),
    )
    .title("设置")
    .inner_size(640.0, 480.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .skip_taskbar(true)
    .center()
    .visible(true)
    .build()
    .map_err(|e| e.to_string())?;
    framelize_window(&win);
    let _ = win.set_focus();

    // 关闭时：解锁主菜单；若菜单是为预览而打开的，则自动收回
    let app2 = app.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            MENU_BLOCKED.store(false, Ordering::SeqCst);
            let _ = app2.emit("menu-blocked", false);
            if !SETTINGS_MENU_WAS_OPEN.load(Ordering::SeqCst) {
                if let Some(main) = app2.get_webview_window("main") {
                    let _ = main.emit("menu-close", ());
                    let _ = main.hide();
                }
            }
        }
    });
    Ok(())
}

#[tauri::command]
async fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    create_settings_window(&app).await
}

#[tauri::command]
fn close_settings_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.close();
    }
}

// 无边框毛玻璃 + 去强调色边框 + WebView2 透明背景（运行时创建的独立窗口通用）
fn framelize_window(win: &tauri::WebviewWindow) {
    let _ = window_vibrancy::apply_acrylic(win, Some((32, 32, 32, 40)));
    #[cfg(target_os = "windows")]
    if let Ok(hwnd_t) = win.hwnd() {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Dwm::{
            DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR,
            DWMWA_VISIBLE_FRAME_BORDER_THICKNESS,
        };
        let hwnd = HWND(hwnd_t.0);
        unsafe {
            let none: u32 = 0xFFFFFFFE;
            let _ = DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, &none as *const u32 as *const _, 4);
            let _ = DwmSetWindowAttribute(hwnd, DWMWA_CAPTION_COLOR, &none as *const u32 as *const _, 4);
            let thickness: i32 = 0;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_VISIBLE_FRAME_BORDER_THICKNESS,
                &thickness as *const i32 as *const _,
                4,
            );
        }
    }
    // 运行时创建的窗口 controller 可能尚未就绪，延迟重试设置透明背景避免白屏
    let win_for_bg = win.clone();
    std::thread::spawn(move || {
        for _ in 0..8 {
            std::thread::sleep(std::time::Duration::from_millis(200));
            let w = win_for_bg.clone();
            let w2 = w.clone();
            if w
                .run_on_main_thread(move || {
                    let _ = w2.with_webview(|webview| {
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
                })
                .is_ok()
            {
                break;
            }
        }
    });
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
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                do_show(&win);
                            }
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            scan_apps, show_start_menu, hide_start_menu, menu_ready, open_toolbar_item,
            launch_app, launch_uwp,
            show_in_folder, uninstall_program,
            get_user_avatar, select_user_avatar, set_user_avatar, save_cropped_avatar,
            open_avatar_settings_window, close_avatar_settings_window, clear_user_avatar,
            get_staged_avatar, stage_cropped_avatar, stage_gif_avatar, commit_avatar, discard_staged_avatar,
            close_avatar_crop_window,
            read_file_base64, get_crop_image, save_gif_avatar,
            load_tile_layout, save_tile_layout,
            select_image, select_svg, read_image_base64, save_image,
            open_tile_style_window, get_tile_style_target, close_tile_style_window,
            open_group_style_window, get_group_style_target, close_group_style_window,
            set_resize_blocked,
            notify_layout_updated,
            get_settings, set_hotkey, get_tile_opacity, set_tile_opacity, set_include_wallpaper_opacity, set_theme_color, set_highlight_color, get_accent_color, set_wallpaper, clear_wallpaper, set_wallpaper_darken, set_panel_alpha, set_tile_blur,
            get_autostart, set_autostart,
            open_settings_window, close_settings_window
        ])
        .setup(|app| {
            app.manage(CropImagePath(Mutex::new(String::new())));
            app.manage(StyleTargets { tile: Mutex::new(String::new()), group: Mutex::new(String::new()) });
            app.manage(AppSettingsState(std::sync::Mutex::new(load_settings())));
            // 注册用户配置的全局快捷键
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                let hk = app.state::<AppSettingsState>().0.lock().unwrap().hotkey.clone();
                if let Ok(sc) = hk.parse::<tauri_plugin_global_shortcut::Shortcut>() {
                    if let Err(e) = app.global_shortcut().register(sc) {
                        eprintln!("[Warn] 全局快捷键 {:?} 注册失败: {}", hk, e);
                    }
                }
            }
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
                    // 强制保留 WS_THICKFRAME，保证无边框窗口可被 startResize 缩放
                    use windows::Win32::UI::WindowsAndMessaging::{
                        GetWindowLongW, SetWindowLongW, GWL_STYLE, WS_THICKFRAME,
                    };
                    let style = GetWindowLongW(hwnd, GWL_STYLE);
                    SetWindowLongW(hwnd, GWL_STYLE, style | WS_THICKFRAME.0 as i32);
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
                    if MENU_BLOCKED.load(Ordering::SeqCst) {
                        // 样式窗打开中，主菜单保持显示，不关闭
                    } else {
                        let _ = win_clone.emit("menu-close", ());
                        let _ = win_clone.hide();
                    }
                }
            });

            // 托盘菜单
            let open_item = MenuItem::with_id(app, "open", "打开开始菜单", true, None::<&str>)?;
            let edit_hotzone_item = tauri::menu::CheckMenuItemBuilder::with_id("hotzone_edit", "编辑热区按钮位置")
                .checked(false)
                .build(app)?;
            let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[&open_item, &sep, &edit_hotzone_item, &sep, &settings_item, &sep, &quit_item],
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
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "settings" => {
                        let app2 = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = create_settings_window(&app2).await;
                        });
                    }
                    "hotzone_edit" => {
                        // CheckMenuItem 点击后由运行时自动切换勾选状态
                        let checked = edit_hotzone_item.is_checked().unwrap_or(false);
                        launch_button::set_edit_mode(checked);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            // 启动热区按钮（原生透明窗口，覆盖系统开始按钮）
            launch_button::start(app.handle().clone());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run()
}
