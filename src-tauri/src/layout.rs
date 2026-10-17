//! Serialized, atomic layout writes with a three-way merge. An editor submits
//! its original snapshot and draft, never an unconditional whole-file overwrite.
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet, HashSet};
use std::fs;
use std::path::Path;
use std::sync::Mutex;

static IO_LOCK: Mutex<()> = Mutex::new(());

fn validate(layout: &Value) -> Result<(), String> {
    let groups = layout
        .get("groups")
        .and_then(Value::as_array)
        .ok_or("布局缺少分组列表")?;
    let mut group_ids = HashSet::new();
    let mut tile_ids = HashSet::new();
    for group in groups {
        let id = group
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
            .ok_or("分组 ID 无效")?;
        if !group_ids.insert(id) {
            return Err("分组 ID 重复".into());
        }
        for tile in group
            .get("tiles")
            .and_then(Value::as_array)
            .ok_or("磁贴列表无效")?
        {
            let id = tile
                .get("id")
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty())
                .ok_or("磁贴 ID 无效")?;
            if !tile_ids.insert(id) {
                return Err("磁贴 ID 重复".into());
            }
        }
    }
    Ok(())
}

fn conflict(path: &str) -> String {
    eprintln!("[layout] conflicting change at {path}");
    "该磁贴或分组已被其他窗口修改。本次更改未保存，请取消后重新打开再编辑。".into()
}

fn indexed(items: &[Value]) -> Result<BTreeMap<&str, &Value>, String> {
    let entries: BTreeMap<_, _> = items
        .iter()
        .map(|item| {
            let id = item
                .get("id")
                .and_then(Value::as_str)
                .ok_or("布局条目 ID 无效")?;
            Ok((id, item))
        })
        .collect::<Result<_, String>>()?;
    if entries.len() != items.len() {
        return Err("布局条目 ID 重复".into());
    }
    Ok(entries)
}

fn merge_ids(
    base: &[Value],
    draft: &[Value],
    latest: &[Value],
    path: &str,
) -> Result<Value, String> {
    let b = indexed(base)?;
    let d = indexed(draft)?;
    let l = indexed(latest)?;
    let ids: BTreeSet<&str> = b.keys().chain(d.keys()).chain(l.keys()).copied().collect();
    let mut merged = BTreeMap::new();
    for id in ids {
        if let Some(value) = merge_value(
            b.get(id).copied(),
            d.get(id).copied(),
            l.get(id).copied(),
            &format!("{path}/{id}"),
        )? {
            merged.insert(id, value);
        }
    }
    // Preserve current order unless this editor explicitly reordered existing
    // entries. Concurrent incompatible reorders are conflicts as well.
    let order = |items: &[Value]| {
        items
            .iter()
            .map(|item| item["id"].as_str().unwrap().to_string())
            .collect::<Vec<_>>()
    };
    let bo = order(base);
    let do_ = order(draft);
    let lo = order(latest);
    let survivors = |items: &[String]| {
        items
            .iter()
            .filter(|id| {
                b.contains_key(id.as_str())
                    && d.contains_key(id.as_str())
                    && l.contains_key(id.as_str())
            })
            .cloned()
            .collect::<Vec<_>>()
    };
    let local_reorder = survivors(&do_) != survivors(&bo);
    if local_reorder && survivors(&lo) != survivors(&bo) && survivors(&lo) != survivors(&do_) {
        return Err(conflict(path));
    }
    let mut result = Vec::new();
    let preferred = if local_reorder { &do_ } else { &lo };
    for id in preferred.iter().chain(do_.iter()).chain(lo.iter()) {
        if let Some(value) = merged.remove(id.as_str()) {
            result.push(value);
        }
    }
    Ok(Value::Array(result))
}

fn merge_value(
    base: Option<&Value>,
    draft: Option<&Value>,
    latest: Option<&Value>,
    path: &str,
) -> Result<Option<Value>, String> {
    if draft == base {
        return Ok(latest.cloned());
    }
    if latest == base || latest == draft {
        return Ok(draft.cloned());
    }
    match (base, draft, latest) {
        (Some(Value::Object(b)), Some(Value::Object(d)), Some(Value::Object(l))) => {
            let keys: BTreeSet<&String> = b.keys().chain(d.keys()).chain(l.keys()).collect();
            let mut result = Map::new();
            for key in keys {
                if let Some(value) =
                    merge_value(b.get(key), d.get(key), l.get(key), &format!("{path}/{key}"))?
                {
                    result.insert(key.clone(), value);
                }
            }
            Ok(Some(Value::Object(result)))
        }
        (Some(Value::Array(b)), Some(Value::Array(d)), Some(Value::Array(l)))
            if path == "/groups" || path.ends_with("/tiles") =>
        {
            Ok(Some(merge_ids(b, d, l, path)?))
        }
        _ => Err(conflict(path)),
    }
}

fn merge(base: &Value, draft: &Value, latest: &Value) -> Result<Value, String> {
    for value in [base, draft, latest] {
        validate(value)?;
    }
    let result = merge_value(Some(base), Some(draft), Some(latest), "")?.ok_or("布局无效")?;
    validate(&result)?;
    Ok(result)
}

fn read(path: &Path) -> Result<Value, String> {
    match fs::read(path) {
        Ok(bytes) => {
            let value = serde_json::from_slice(&bytes)
                .map_err(|error| format!("布局文件无法读取，原文件已保留：{error}"))?;
            validate(&value)?;
            Ok(value)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(json!({"groups": []})),
        Err(error) => Err(format!("读取布局失败：{error}")),
    }
}

pub fn load(path: &Path) -> Result<Value, String> {
    let _guard = IO_LOCK.lock().map_err(|_| "布局存储不可用")?;
    read(path)
}

pub fn save(path: &Path, base: &Value, draft: &Value) -> Result<Value, String> {
    let _guard = IO_LOCK.lock().map_err(|_| "布局存储不可用")?;
    let latest = read(path)?;
    let result = merge(base, draft, &latest)?;
    if result != latest {
        crate::storage::write_json_atomic(path, &result)?;
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::OpenOptions;
    fn layout() -> Value {
        json!({"groups":[{"id":"g1","name":"one","tiles":[{"id":"t1","row":0,"col":0,"size":"medium","iconColor":"red"}]},{"id":"g2","tiles":[]}]})
    }
    #[test]
    fn separate_fields_and_groups_merge_without_reverting_latest() {
        let base = layout();
        let mut draft = base.clone();
        let mut latest = base.clone();
        draft["groups"][0]["tiles"][0]["iconColor"] = json!("blue");
        latest["groups"][0]["tiles"][0]["row"] = json!(4);
        latest["groups"][1]["background"] = json!("new.png");
        let result = merge(&base, &draft, &latest).unwrap();
        assert_eq!(result["groups"][0]["tiles"][0]["row"], 4);
        assert_eq!(result["groups"][0]["tiles"][0]["iconColor"], "blue");
        assert_eq!(result["groups"][1]["background"], "new.png");
    }
    #[test]
    fn conflicting_field_is_rejected() {
        let base = layout();
        let mut draft = base.clone();
        let mut latest = base.clone();
        draft["groups"][0]["tiles"][0]["iconColor"] = json!("blue");
        latest["groups"][0]["tiles"][0]["iconColor"] = json!("green");
        assert!(merge(&base, &draft, &latest).is_err());
    }
    #[test]
    fn deleted_target_is_not_resurrected_and_edited_target_is_not_deleted() {
        let base = layout();
        let mut edited = base.clone();
        let mut deleted = base.clone();
        edited["groups"][0]["tiles"][0]["iconColor"] = json!("blue");
        deleted["groups"][0]["tiles"] = json!([]);
        assert!(merge(&base, &edited, &deleted).is_err());
        assert!(merge(&base, &deleted, &edited).is_err());
    }
    #[test]
    fn clearing_a_field_preserves_unrelated_new_tiles() {
        let base = layout();
        let mut draft = base.clone();
        let mut latest = base.clone();
        draft["groups"][0]["tiles"][0]
            .as_object_mut()
            .unwrap()
            .remove("iconColor");
        latest["groups"][1]["tiles"] = json!([{"id":"t2"}]);
        let result = merge(&base, &draft, &latest).unwrap();
        assert!(result["groups"][0]["tiles"][0].get("iconColor").is_none());
        assert_eq!(result["groups"][1]["tiles"][0]["id"], "t2");
    }
    #[test]
    fn duplicate_ids_are_rejected() {
        let base = layout();
        let mut draft = base.clone();
        draft["groups"][1]["tiles"] = json!([{"id":"t1"}]);
        assert!(merge(&base, &draft, &base).is_err());
    }
    #[test]
    fn explicit_reorder_preserves_concurrently_added_groups() {
        let base = layout();
        let mut draft = base.clone();
        draft["groups"].as_array_mut().unwrap().reverse();
        let mut latest = base.clone();
        latest["groups"]
            .as_array_mut()
            .unwrap()
            .push(json!({"id":"g3", "tiles":[]}));
        let merged = merge(&base, &draft, &latest).unwrap();
        assert_eq!(merged["groups"][0]["id"], "g2");
        assert_eq!(merged["groups"][1]["id"], "g1");
        assert_eq!(merged["groups"][2]["id"], "g3");
    }
    #[test]
    fn failed_file_replacement_keeps_previous_layout() {
        use std::os::windows::fs::OpenOptionsExt;
        use windows::Win32::Storage::FileSystem::{FILE_SHARE_READ, FILE_SHARE_WRITE};
        let directory =
            std::env::temp_dir().join(format!("win-start-layout-lock-test-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("layout.json");
        let base = layout();
        save(&path, &json!({"groups":[]}), &base).unwrap();
        let previous = fs::read(&path).unwrap();
        // Simulate another program holding the file without delete sharing.
        let held = OpenOptions::new()
            .read(true)
            .share_mode((FILE_SHARE_READ | FILE_SHARE_WRITE).0)
            .open(&path)
            .unwrap();
        let mut draft = base.clone();
        draft["groups"][0]["name"] = json!("updated");
        assert!(save(&path, &base, &draft).is_err());
        assert_eq!(fs::read(&path).unwrap(), previous);
        drop(held);
        assert!(save(&path, &base, &draft).is_ok());
        fs::remove_file(path).unwrap();
        fs::remove_dir(directory).unwrap();
    }
    #[test]
    fn disk_writes_merge_and_conflicts_leave_file_unchanged() {
        let directory =
            std::env::temp_dir().join(format!("win-start-layout-test-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("layout.json");
        let empty = json!({"groups": []});
        let base = layout();
        save(&path, &empty, &base).unwrap();
        let mut first = base.clone();
        first["groups"][0]["name"] = json!("new");
        save(&path, &base, &first).unwrap();
        let mut second = base.clone();
        second["groups"][1]["background"] = json!("image.png");
        let merged = save(&path, &base, &second).unwrap();
        assert_eq!(merged["groups"][0]["name"], "new");
        let original = fs::read(&path).unwrap();
        second["groups"][0]["name"] = json!("conflict");
        assert!(save(&path, &base, &second).is_err());
        assert_eq!(fs::read(&path).unwrap(), original);
        // Corrupt input must never silently become a new empty layout.
        fs::write(&path, b"broken").unwrap();
        assert!(save(&path, &empty, &base).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"broken");
        fs::remove_file(path).unwrap();
        fs::remove_dir(directory).unwrap();
    }
}
