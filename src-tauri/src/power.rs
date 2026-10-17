//! Only execute in response to an explicit user action. Tests never call the
//! native executor; privilege tests use an isolated duplicate token.
use serde::Deserialize;
use std::sync::Mutex;
use windows::Win32::Foundation::{CloseHandle, GetLastError, ERROR_NOT_ALL_ASSIGNED, HANDLE, LUID};
use windows::Win32::Security::{
    AdjustTokenPrivileges, LookupPrivilegeValueW, LUID_AND_ATTRIBUTES, SE_PRIVILEGE_ENABLED,
    SE_SHUTDOWN_NAME, TOKEN_ADJUST_PRIVILEGES, TOKEN_PRIVILEGES, TOKEN_QUERY,
};
use windows::Win32::System::Power::SetSuspendState;
use windows::Win32::System::Shutdown::{
    ExitWindowsEx, LockWorkStation, EWX_POWEROFF, EWX_REBOOT, EXIT_WINDOWS_FLAGS,
    SHTDN_REASON_FLAG_PLANNED, SHTDN_REASON_MAJOR_APPLICATION,
};
use windows::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

static POWER_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Lock,
    Sleep,
    Shutdown,
    Restart,
}

#[derive(Debug, PartialEq)]
enum Plan {
    Lock,
    Sleep {
        hibernate: bool,
        force: bool,
        disable_wake: bool,
    },
    Exit(EXIT_WINDOWS_FLAGS),
}

fn plan(action: Action) -> Plan {
    match action {
        Action::Lock => Plan::Lock,
        Action::Sleep => Plan::Sleep {
            hibernate: false,
            force: false,
            disable_wake: false,
        },
        Action::Shutdown => Plan::Exit(EWX_POWEROFF),
        Action::Restart => Plan::Exit(EWX_REBOOT),
    }
}

struct ShutdownPrivilege {
    token: HANDLE,
    previous: TOKEN_PRIVILEGES,
    changed: bool,
}

impl ShutdownPrivilege {
    unsafe fn enable() -> Result<Self, String> {
        let mut token = HANDLE::default();
        OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
            &mut token,
        )
        .map_err(|error| format!("打开电源操作权限令牌失败：{error}"))?;
        Self::enable_on_owned_token(token)
    }

    // Takes ownership, including on failure. Tests can exercise the real API
    // on an independent token without changing the process token's privileges.
    unsafe fn enable_on_owned_token(token: HANDLE) -> Result<Self, String> {
        let mut guard = Self {
            token,
            previous: TOKEN_PRIVILEGES::default(),
            changed: false,
        };
        let mut luid = LUID::default();
        LookupPrivilegeValueW(None, SE_SHUTDOWN_NAME, &mut luid)
            .map_err(|error| format!("查询关机权限失败：{error}"))?;
        let requested = TOKEN_PRIVILEGES {
            PrivilegeCount: 1,
            Privileges: [LUID_AND_ATTRIBUTES {
                Luid: luid,
                Attributes: SE_PRIVILEGE_ENABLED,
            }],
        };
        let mut returned_length = 0u32;
        AdjustTokenPrivileges(
            token,
            false,
            Some(&requested),
            std::mem::size_of::<TOKEN_PRIVILEGES>() as u32,
            Some(&mut guard.previous),
            Some(&mut returned_length),
        )
        .map_err(|error| format!("启用关机权限失败：{error}"))?;
        if GetLastError() == ERROR_NOT_ALL_ASSIGNED {
            return Err("当前用户没有执行该电源操作的权限".into());
        }
        guard.changed = true;
        Ok(guard)
    }
}
impl Drop for ShutdownPrivilege {
    fn drop(&mut self) {
        unsafe {
            if self.changed {
                if let Err(error) =
                    AdjustTokenPrivileges(self.token, false, Some(&self.previous), 0, None, None)
                {
                    eprintln!("[power] failed to restore privilege: {error}");
                }
            }
            let _ = CloseHandle(self.token);
        }
    }
}

pub fn execute(action: Action) -> Result<(), String> {
    let _lock = POWER_LOCK.lock().map_err(|_| "电源操作暂不可用")?;
    unsafe {
        match plan(action) {
            Plan::Lock => LockWorkStation().map_err(|error| error.to_string()),
            Plan::Sleep {
                hibernate,
                force,
                disable_wake,
            } => {
                let _privilege = ShutdownPrivilege::enable()?;
                if SetSuspendState(hibernate, force, disable_wake).as_bool() {
                    Ok(())
                } else {
                    Err(windows::core::Error::from_win32().to_string())
                }
            }
            Plan::Exit(flags) => {
                let _privilege = ShutdownPrivilege::enable()?;
                ExitWindowsEx(
                    flags,
                    SHTDN_REASON_MAJOR_APPLICATION | SHTDN_REASON_FLAG_PLANNED,
                )
                .map_err(|error| error.to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn privilege_round_trip_uses_an_isolated_token_and_valid_output_buffers() {
        use windows::Win32::Security::{
            DuplicateTokenEx, SecurityImpersonation, TokenPrimary, TOKEN_DUPLICATE,
        };
        unsafe {
            let mut process = HANDLE::default();
            OpenProcessToken(GetCurrentProcess(), TOKEN_DUPLICATE | TOKEN_QUERY, &mut process).unwrap();
            let mut duplicate = HANDLE::default();
            let copied = DuplicateTokenEx(
                process, TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, None,
                SecurityImpersonation, TokenPrimary, &mut duplicate,
            );
            let _ = CloseHandle(process);
            copied.unwrap();
            // No impersonation or process-token replacement: this token is
            // only used as an argument to AdjustTokenPrivileges, then closed.
            match ShutdownPrivilege::enable_on_owned_token(duplicate) {
                Ok(guard) => {
                    assert!(guard.previous.PrivilegeCount <= 1);
                    drop(guard);
                }
                Err(error) => assert_eq!(error, "当前用户没有执行该电源操作的权限"),
            }
        }
    }
    #[test]
    fn invalid_actions_cannot_reach_executor() {
        for value in ["hibernate", "shutdown /f", "", "reboot"] {
            assert!(serde_json::from_value::<Action>(serde_json::json!(value)).is_err());
        }
    }
    #[test]
    fn shutdown_and_restart_never_force_close_applications() {
        use windows::Win32::System::Shutdown::{EWX_FORCE, EWX_FORCEIFHUNG};
        for action in [Action::Shutdown, Action::Restart] {
            let Plan::Exit(flags) = plan(action) else {
                panic!()
            };
            assert_eq!((flags & (EWX_FORCE | EWX_FORCEIFHUNG)).0, 0);
        }
        assert_eq!(plan(Action::Shutdown), Plan::Exit(EWX_POWEROFF));
        assert_eq!(plan(Action::Restart), Plan::Exit(EWX_REBOOT));
    }
    #[test]
    fn sleep_is_not_hibernation_and_keeps_wake_events() {
        assert_eq!(
            plan(Action::Sleep),
            Plan::Sleep {
                hibernate: false,
                force: false,
                disable_wake: false
            }
        );
        assert_eq!(plan(Action::Lock), Plan::Lock);
    }
}
