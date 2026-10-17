// Scan physical shortcuts plus packaged/desktop Shell entries from Get-StartApps.

use crate::icon_extract::extract_icon_png;
use serde::Serialize;
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

// 控制台子进程不弹黑窗：release 构建为 GUI 子系统，spawn powershell 会
// 强制创建新控制台窗口，加此标志彻底隐藏。
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize)]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub icon: String,
    #[serde(rename = "firstSeenAt")]
    pub first_seen_at: Option<u64>,
}

#[derive(Debug, Serialize, Default)]
pub struct ScanResult {
    pub apps: Vec<AppEntry>,
    pub complete: bool,
    pub warnings: Vec<String>,
}

fn user_start_menu() -> Option<PathBuf> {
    let appdata = std::env::var("APPDATA").ok()?;
    Some(PathBuf::from(appdata).join(r"Microsoft\Windows\Start Menu\Programs"))
}

fn system_start_menu() -> Option<PathBuf> {
    let program_data = std::env::var("ProgramData").ok()?;
    Some(PathBuf::from(program_data).join(r"Microsoft\Windows\Start Menu\Programs"))
}

fn scan_lnk_dir(dir: &Path, out: &mut Vec<AppEntry>, warnings: &mut Vec<String>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
        Err(error) => {
            warnings.push(format!("{}: {error}", dir.display()));
            return;
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                warnings.push(error.to_string());
                continue;
            }
        };
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("lnk") {
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            let id = format!("lnk:{}", path.to_string_lossy());
            let icon = extract_icon_png(&path.to_string_lossy()).unwrap_or_default();
            out.push(AppEntry {
                first_seen_at: None,
                id,
                name,
                path: path.to_string_lossy().to_string(),
                kind: "win32".into(),
                icon,
            });
        } else {
            match entry.file_type() {
                Ok(kind) if kind.is_dir() => scan_lnk_dir(&path, out, warnings),
                Ok(_) => {}
                Err(error) => warnings.push(format!("{}: {error}", path.display())),
            }
        }
    }
}

fn scan_shell_apps() -> Result<Vec<AppEntry>, String> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "$ErrorActionPreference='Stop'; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; @(Get-StartApps | Select-Object Name, AppID) | ConvertTo-Json -Compress"
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(std::process::Stdio::piped())
        .output();
    let output = output.map_err(|error| error.to_string())?;
    parse_shell_output(output.status.success(), &output.stdout)
}

fn parse_shell_output(success: bool, stdout: &[u8]) -> Result<Vec<AppEntry>, String> {
    if !success {
        return Err("Get-StartApps failed".into());
    }
    let stdout = std::str::from_utf8(stdout).map_err(|error| error.to_string())?;
    // No pipeline output is a valid empty result only after a successful exit.
    if stdout.trim().is_empty() {
        return Ok(vec![]);
    }
    let json: serde_json::Value = serde_json::from_str(stdout.trim_start_matches('\u{feff}'))
        .map_err(|error| error.to_string())?;
    let arr = match json {
        serde_json::Value::Array(a) => a,
        serde_json::Value::Null => vec![],
        single => vec![single],
    };
    arr.into_iter()
        .map(|item| {
            let name = item
                .get("Name")
                .and_then(|value| value.as_str())
                .filter(|value| !value.trim().is_empty())
                .ok_or("Get-StartApps returned an invalid name")?
                .to_string();
            let app_id = item
                .get("AppID")
                .and_then(|value| value.as_str())
                .filter(|value| !value.trim().is_empty())
                .ok_or("Get-StartApps returned an invalid AppID")?
                .to_string();
            let kind = shell_kind(&app_id).to_string();
            Ok(AppEntry {
                first_seen_at: None,
                // Keep legacy IDs so existing tiles do not lose their target.
                id: format!("uwp:{}", app_id),
                name,
                path: app_id,
                kind,
                icon: String::new(),
            })
        })
        .collect()
}

// Package identity is not synonymous with UWP: packaged desktop apps also
// use a package-family AUMID. Other Get-StartApps entries remain Shell entries.
fn shell_kind(app_id: &str) -> &'static str {
    let packaged = app_id
        .split_once('!')
        .map(|(family, application)| {
            !application.is_empty()
                && !application.contains('!')
                && family
                    .rsplit_once('_')
                    .map(|(name, publisher)| {
                        !name.is_empty()
                            && publisher.len() == 13
                            && publisher.bytes().all(|byte| byte.is_ascii_alphanumeric())
                    })
                    .unwrap_or(false)
        })
        .unwrap_or(false);
    if packaged {
        "packaged"
    } else {
        "shell"
    }
}

pub fn scan_all() -> ScanResult {
    let mut apps = Vec::new();
    let mut warnings = Vec::new();
    if let Some(dir) = user_start_menu() {
        scan_lnk_dir(&dir, &mut apps, &mut warnings);
    } else {
        warnings.push("APPDATA is unavailable".into());
    }
    if let Some(dir) = system_start_menu() {
        scan_lnk_dir(&dir, &mut apps, &mut warnings);
    } else {
        warnings.push("ProgramData is unavailable".into());
    }
    match scan_shell_apps() {
        Ok(entries) => apps.extend(entries),
        Err(error) => warnings.push(error),
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.id == b.id);
    ScanResult {
        apps,
        complete: warnings.is_empty(),
        warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shell_entries_are_not_all_classified_as_uwp_and_ids_stay_stable() {
        let entries = parse_shell_output(true, br#"[{"Name":"Calculator","AppID":"Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"},{"Name":"Desktop","AppID":"Microsoft.AutoGenerated.123"},{"Name":"Odd","AppID":"Desktop!Command"}]"#).unwrap();
        assert_eq!(entries[0].kind, "packaged");
        assert_eq!(entries[1].kind, "shell");
        assert_eq!(entries[2].kind, "shell");
        assert_eq!(
            entries[0].id,
            "uwp:Microsoft.WindowsCalculator_8wekyb3d8bbwe!App"
        );
        assert_eq!(entries[1].id, "uwp:Microsoft.AutoGenerated.123");
    }
    #[test]
    fn unsuccessful_command_is_not_an_empty_success() {
        assert!(parse_shell_output(false, b"[]").is_err());
    }
    #[test]
    fn malformed_or_partial_json_is_failure() {
        assert!(parse_shell_output(true, b"[").is_err());
        assert!(parse_shell_output(
            true,
            br#"[{"Name":"valid","AppID":"id"},{"Name":"missing-id"}]"#
        )
        .is_err());
    }
    #[test]
    fn empty_success_and_single_application_are_supported() {
        for bytes in [b"".as_slice(), b"[]", b"null"] {
            assert!(parse_shell_output(true, bytes).unwrap().is_empty());
        }
        assert_eq!(
            parse_shell_output(true, br#"{"Name":"App","AppID":"package!app"}"#)
                .unwrap()
                .len(),
            1
        );
    }
}
