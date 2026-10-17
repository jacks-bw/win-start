use std::collections::HashSet;

pub const KEYS: [&str; 8] = [
    "explorer",
    "settings",
    "controlPanel",
    "recycleBin",
    "documents",
    "downloads",
    "run",
    "taskManager",
];

pub fn default_items() -> Vec<String> {
    ["explorer", "settings", "controlPanel", "recycleBin"]
        .map(String::from)
        .to_vec()
}

pub fn validate(items: Vec<String>) -> Result<Vec<String>, String> {
    let mut seen = HashSet::new();
    for key in &items {
        if !KEYS.contains(&key.as_str()) {
            return Err(format!("不支持的工具栏按钮：{key}"));
        }
        if !seen.insert(key) {
            return Err("工具栏按钮不能重复".into());
        }
    }
    Ok(items)
}

#[derive(Debug, PartialEq)]
pub enum Target {
    Shell(String),
    RunDialog,
}

pub fn target(
    key: &str,
    documents: Option<std::path::PathBuf>,
    downloads: Option<std::path::PathBuf>,
) -> Result<Target, String> {
    let value = match key {
        "explorer" => "explorer.exe",
        "settings" => "ms-settings:",
        "controlPanel" => "control.exe",
        "recycleBin" => "shell:RecycleBinFolder",
        "taskManager" => "taskmgr.exe",
        "run" => return Ok(Target::RunDialog),
        "documents" => {
            return documents
                .map(|path| Target::Shell(path.to_string_lossy().into_owned()))
                .ok_or("无法确定文档目录".into())
        }
        "downloads" => {
            return downloads
                .map(|path| Target::Shell(path.to_string_lossy().into_owned()))
                .ok_or("无法确定下载目录".into())
        }
        _ => return Err("不支持的工具栏操作".into()),
    };
    Ok(Target::Shell(value.into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validation_preserves_order_and_allows_empty_toolbar() {
        assert_eq!(
            validate(vec!["downloads".into(), "explorer".into()]).unwrap(),
            vec!["downloads", "explorer"]
        );
        assert!(validate(vec![]).unwrap().is_empty());
    }
    #[test]
    fn invalid_and_duplicate_actions_are_rejected() {
        assert!(validate(vec!["shutdown".into()]).is_err());
        assert!(validate(vec!["explorer".into(), "explorer".into()]).is_err());
    }
    #[test]
    fn paths_and_system_uris_are_not_composed_into_cmd_strings() {
        let path = std::path::PathBuf::from(r"C:\Users\A & B\Documents");
        assert_eq!(
            target("documents", Some(path.clone()), None).unwrap(),
            Target::Shell(path.to_string_lossy().into_owned())
        );
        assert_eq!(
            target("settings", None, None).unwrap(),
            Target::Shell("ms-settings:".into())
        );
        assert!(target("downloads", None, None).is_err());
        assert!(target("unknown", None, None).is_err());
    }
}
