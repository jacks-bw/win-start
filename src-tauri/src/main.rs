// win-start Tauri 主进程骨架
// 对应 Electron 版本的 src/main/index.ts

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WindowEvent};
use window_vibrancy::apply_acrylic;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let win = app.get_webview_window("main").unwrap();

            // Acrylic 毛玻璃
            let _ = apply_acrylic(&win, Some((32, 32, 32, 40)));

            // 失焦自动隐藏（对应 Electron 的 blur -> hideStartMenu）
            let win_clone = win.clone();
            win.on_window_event(move |event| {
                if let WindowEvent::Focused(false) = event {
                    let _ = win_clone.hide();
                }
            });

            // 全局快捷键 Alt+W 切换
            let win_clone = win.clone();
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcut("Alt+W")?
                    .with_handler(move |_app, _shortcut, event| {
                        if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                            if win_clone.is_visible().unwrap_or(false) {
                                let _ = win_clone.hide();
                            } else {
                                let _ = win_clone.show();
                                let _ = win_clone.set_focus();
                            }
                        }
                    })
                    .build(),
            )?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run()
}
