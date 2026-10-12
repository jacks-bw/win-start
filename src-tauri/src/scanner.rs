// 扫描开始菜单程序：.lnk 快捷方式 + UWP（Get-StartApps）
// 对应 Electron 的 scanner.ts / lnk-scan.ts / uwp-apps.ts

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String, // "win32" | "uwp"
    pub icon: String, // 暂为空，后续提取
}

fn user_start_menu() -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").ok()?;
    Some(PathBuf::from(appdata).join(r"Microsoft\Windows\Start Menu\Programs"))
}

fn system_start_menu() -> Option<PathBuf> {
    let program_data = std::env::var("ProgramData").ok()?;
    Some(PathBuf::from(program_data).join(r"Microsoft\Windows\Start Menu\Programs"))
}

fn scan_lnk_dir(dir: &Path, out: &mut Vec<AppEntry>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("lnk") {
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            let id = format!("lnk:{}", path.to_string_lossy());
            out.push(AppEntry {
                id,
                name,
                path: path.to_string_lossy().to_string(),
                kind: "win32".into(),
                icon: String::new(),
            });
        } else if path.is_dir() {
            scan_lnk_dir(&path, out);
        }
    }
}

fn scan_uwp() -> Vec<AppEntry> {
    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", "Get-StartApps | ConvertTo-Json"])
        .output();
    let Ok(output) = output else { return vec![] };
    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(&stdout);
    let Ok(json) = parsed else { return vec![] };
    let arr = match json {
        serde_json::Value::Array(a) => a,
        single => vec![single],
    };
    arr.into_iter()
        .filter_map(|item| {
            let name = item.get("Name")?.as_str()?.to_string();
            let app_id = item.get("AppID")?.as_str()?.to_string();
            Some(AppEntry {
                id: format!("uwp:{}", app_id),
                name,
                path: app_id,
                kind: "uwp".into(),
                icon: String::new(),
            })
        })
        .collect()
}

pub fn scan_all() -> Vec<AppEntry> {
    let mut apps = Vec::new();
    if let Some(dir) = user_start_menu() {
        scan_lnk_dir(&dir, &mut apps);
    }
    if let Some(dir) = system_start_menu() {
        scan_lnk_dir(&dir, &mut apps);
    }
    apps.extend(scan_uwp());
    // 去重
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.id == b.id);
    apps
}
