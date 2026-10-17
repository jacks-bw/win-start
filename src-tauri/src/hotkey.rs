//! A shortcut change is a transaction over native registrations and persistence.
//! No blanket unregister: keep the old key until the new key can be registered.
use tauri_plugin_global_shortcut::{GlobalShortcut, Shortcut};

pub trait Registry {
    fn contains(&self, shortcut: Shortcut) -> bool;
    fn register(&mut self, shortcut: Shortcut) -> Result<(), String>;
    fn unregister(&mut self, shortcut: Shortcut) -> Result<(), String>;
}

impl<R: tauri::Runtime> Registry for &GlobalShortcut<R> {
    fn contains(&self, shortcut: Shortcut) -> bool {
        GlobalShortcut::is_registered(*self, shortcut)
    }
    fn register(&mut self, shortcut: Shortcut) -> Result<(), String> {
        GlobalShortcut::register(*self, shortcut).map_err(|error| error.to_string())
    }
    fn unregister(&mut self, shortcut: Shortcut) -> Result<(), String> {
        GlobalShortcut::unregister(*self, shortcut).map_err(|error| error.to_string())
    }
}

fn parse(value: &str) -> Result<Option<Shortcut>, String> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    value
        .parse()
        .map(Some)
        .map_err(|error| format!("快捷键无效：{error}"))
}

fn rollback(
    registry: &mut impl Registry,
    previous: Option<Shortcut>,
    added: Option<Shortcut>,
    reason: String,
) -> String {
    let mut errors = Vec::new();
    // Restore the old working key before removing the replacement.
    if let Some(key) = previous {
        if !registry.contains(key) {
            if let Err(error) = registry.register(key) {
                errors.push(format!("恢复原快捷键失败：{error}"));
            }
        }
    }
    if let Some(key) = added {
        if registry.contains(key) {
            if let Err(error) = registry.unregister(key) {
                errors.push(format!("撤销新快捷键失败：{error}"));
            }
        }
    }
    if errors.is_empty() {
        reason
    } else {
        format!(
            "{reason}；{}。可通过托盘打开菜单后重新设置快捷键。",
            errors.join("；")
        )
    }
}

pub fn change(
    registry: &mut impl Registry,
    previous: &str,
    desired: &str,
    persist: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    // Parse before touching any registrations, even if old config was invalid.
    let target = parse(desired)?;
    let old = parse(previous)
        .ok()
        .flatten()
        .filter(|key| registry.contains(*key));
    let mut added = None;
    if let Some(key) = target {
        if !registry.contains(key) {
            registry
                .register(key)
                .map_err(|error| format!("新快捷键被占用或无法注册，当前配置未修改：{error}"))?;
            added = Some(key);
        }
    }
    if let Some(key) = old.filter(|key| Some(*key) != target) {
        if let Err(error) = registry.unregister(key) {
            return Err(rollback(
                registry,
                old,
                added,
                format!("停用原快捷键失败，当前配置未修改：{error}"),
            ));
        }
    }
    if let Err(error) = persist() {
        return Err(rollback(
            registry,
            old,
            added,
            format!("保存快捷键配置失败，当前配置未修改：{error}"),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    const OLD: &str = "Alt+W";
    const NEW: &str = "Ctrl+Alt+K";
    fn key(value: &str) -> Shortcut {
        parse(value).unwrap().unwrap()
    }
    #[derive(Default)]
    struct Fake {
        active: HashSet<Shortcut>,
        calls: Vec<(bool, Shortcut)>,
        fail_register: HashSet<Shortcut>,
        fail_unregister: HashSet<Shortcut>,
    }
    impl Registry for Fake {
        fn contains(&self, key: Shortcut) -> bool {
            self.active.contains(&key)
        }
        fn register(&mut self, key: Shortcut) -> Result<(), String> {
            self.calls.push((true, key));
            if self.fail_register.contains(&key) {
                return Err("register failed".into());
            }
            self.active.insert(key);
            Ok(())
        }
        fn unregister(&mut self, key: Shortcut) -> Result<(), String> {
            self.calls.push((false, key));
            if self.fail_unregister.contains(&key) {
                return Err("unregister failed".into());
            }
            self.active.remove(&key);
            Ok(())
        }
    }
    fn working() -> Fake {
        Fake {
            active: HashSet::from([key(OLD)]),
            ..Default::default()
        }
    }

    #[test]
    fn invalid_input_does_not_touch_old_key_or_persistence() {
        let mut registry = working();
        assert!(change(&mut registry, OLD, "not-a-valid-key", || panic!(
            "must not persist"
        ))
        .is_err());
        assert!(registry.calls.is_empty());
        assert!(registry.contains(key(OLD)));
    }
    #[test]
    fn occupied_key_keeps_old_and_unrelated_registrations() {
        let mut registry = working();
        registry.active.insert(key("Alt+F9"));
        registry.fail_register.insert(key(NEW));
        assert!(change(&mut registry, OLD, NEW, || panic!("must not persist")).is_err());
        assert!(registry.contains(key(OLD)));
        assert!(registry.contains(key("Alt+F9")));
        assert_eq!(registry.calls, vec![(true, key(NEW))]);
    }
    #[test]
    fn success_registers_new_before_removing_old() {
        let mut registry = working();
        let mut persisted = false;
        change(&mut registry, OLD, NEW, || {
            persisted = true;
            Ok(())
        })
        .unwrap();
        assert!(persisted);
        assert_eq!(registry.calls, vec![(true, key(NEW)), (false, key(OLD))]);
        assert_eq!(registry.active, HashSet::from([key(NEW)]));
    }
    #[test]
    fn write_failure_restores_old_then_removes_new() {
        let mut registry = working();
        assert!(change(&mut registry, OLD, NEW, || Err("disk full".into())).is_err());
        assert_eq!(registry.active, HashSet::from([key(OLD)]));
        assert_eq!(&registry.calls[2..], &[(true, key(OLD)), (false, key(NEW))]);
    }
    #[test]
    fn unregister_failure_cleans_up_new_without_persisting() {
        let mut registry = working();
        registry.fail_unregister.insert(key(OLD));
        assert!(change(&mut registry, OLD, NEW, || panic!("must not persist")).is_err());
        assert_eq!(registry.active, HashSet::from([key(OLD)]));
    }
    #[test]
    fn same_key_and_whitespace_do_not_unregister_it() {
        let mut registry = working();
        change(&mut registry, OLD, " Alt+W ", || Ok(())).unwrap();
        assert!(registry.calls.is_empty());
    }
    #[test]
    fn disabling_rolls_back_if_persistence_fails() {
        let mut registry = working();
        assert!(change(&mut registry, OLD, "", || Err("write failed".into())).is_err());
        assert_eq!(registry.active, HashSet::from([key(OLD)]));
        change(&mut registry, OLD, "", || Ok(())).unwrap();
        assert!(registry.active.is_empty());
    }
    #[test]
    fn empty_or_unregistered_previous_key_is_not_unregistered() {
        let mut registry = Fake::default();
        change(&mut registry, OLD, NEW, || Ok(())).unwrap();
        assert_eq!(registry.calls, vec![(true, key(NEW))]);
        let mut registry = Fake::default();
        assert!(change(&mut registry, "", NEW, || Err("write failed".into())).is_err());
        assert!(registry.active.is_empty());
    }
    #[test]
    fn rollback_failure_is_reported_instead_of_claiming_old_was_restored() {
        let mut registry = working();
        registry.fail_register.insert(key(OLD));
        let error = change(&mut registry, OLD, NEW, || Err("disk full".into())).unwrap_err();
        assert!(error.contains("恢复原快捷键失败"));
        assert!(error.contains("托盘"));
    }
    #[test]
    fn preexisting_replacement_is_not_removed_on_failed_change() {
        let mut registry = working();
        registry.active.insert(key(NEW));
        assert!(change(&mut registry, OLD, NEW, || Err("write failed".into())).is_err());
        assert!(registry.contains(key(OLD)));
        assert!(registry.contains(key(NEW)));
    }

    #[test]
    fn failure_to_remove_replacement_is_reported_and_old_is_restored() {
        let mut registry = working();
        registry.fail_unregister.insert(key(NEW));
        let error = change(&mut registry, OLD, NEW, || Err("disk full".into())).unwrap_err();
        assert!(registry.contains(key(OLD)));
        assert!(registry.contains(key(NEW)));
        assert!(error.contains("撤销新快捷键失败"));
    }
}
