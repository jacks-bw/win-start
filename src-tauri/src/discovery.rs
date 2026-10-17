//! First discovery is a local observation, not an installation timestamp.
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path, sync::Mutex};

static HISTORY_LOCK: Mutex<()> = Mutex::new(());

#[derive(Default, Deserialize, Serialize)]
struct History {
    initialized: bool,
    // None means present at baseline; keep absent IDs to avoid false re-additions.
    entries: BTreeMap<String, Option<u64>>,
}

impl History {
    fn observe(&mut self, ids: &[String], complete: bool, now: u64) {
        for id in ids {
            let timestamp = self.initialized.then_some(now);
            self.entries.entry(id.clone()).or_insert(timestamp);
        }
        if complete { self.initialized = true; }
    }
}

pub fn record(path: &Path, ids: &[String], complete: bool, now: u64) -> Result<BTreeMap<String, Option<u64>>, String> {
    let _lock = HISTORY_LOCK.lock().map_err(|_| "应用发现记录暂不可用")?;
    let mut history: History = match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| format!("无法读取应用发现记录：{error}"))?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => History::default(),
        Err(error) => return Err(format!("无法读取应用发现记录：{error}")),
    };
    history.observe(ids, complete, now);
    // Do not publish timestamps that have not survived persistence.
    crate::storage::write_json_atomic(path, &history)?;
    Ok(history.entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ids(values: &[&str]) -> Vec<String> { values.iter().map(|value| value.to_string()).collect() }

    #[test]
    fn partial_initial_scans_do_not_mark_the_baseline_as_new() {
        let mut history = History::default();
        history.observe(&ids(&["a"]), false, 10);
        history.observe(&ids(&["b"]), false, 20);
        assert!(!history.initialized);
        history.observe(&ids(&["a", "c"]), true, 30);
        assert!(history.initialized);
        assert!(history.entries.values().all(Option::is_none));
        history.observe(&ids(&["d"]), false, 40);
        assert_eq!(history.entries["d"], Some(40));
    }

    #[test]
    fn rescan_disappearance_and_restart_preserve_original_discovery_time() {
        let mut history = History::default();
        history.observe(&ids(&["old"]), true, 10);
        history.observe(&ids(&["new"]), true, 20);
        history.observe(&[], true, 30);
        let bytes = serde_json::to_vec(&history).unwrap();
        let mut restored: History = serde_json::from_slice(&bytes).unwrap();
        restored.observe(&ids(&["old", "new"]), true, 40);
        assert_eq!(restored.entries["old"], None);
        assert_eq!(restored.entries["new"], Some(20));
    }

    #[test]
    fn corrupt_history_and_failed_writes_leave_previous_bytes_untouched() {
        let directory = std::env::temp_dir().join(format!("win-start-discovery-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("history.json");
        std::fs::write(&path, b"invalid json").unwrap();
        assert!(record(&path, &ids(&["a"]), true, 10).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"invalid json");
        std::fs::remove_file(&path).unwrap();
        assert_eq!(record(&path, &ids(&["old"]), true, 10).unwrap()["old"], None);
        let before = std::fs::read(&path).unwrap();
        let pending = path.with_extension(format!("json.{}.pending", std::process::id()));
        std::fs::create_dir(&pending).unwrap();
        assert!(record(&path, &ids(&["new"]), true, 20).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), before);
        std::fs::remove_dir(&pending).unwrap();
        assert_eq!(record(&path, &ids(&["new"]), true, 30).unwrap()["new"], Some(30));
        std::fs::remove_file(&path).unwrap();
        std::fs::remove_dir(&directory).unwrap();
    }
}
