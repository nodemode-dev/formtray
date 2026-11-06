use std::path::Path;
use std::process::{Command, Stdio};

use crate::registry::AppEntry;

#[derive(Debug)]
pub enum LaunchError {
    NotFound(String),
    Failed(String),
}

impl std::fmt::Display for LaunchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LaunchError::NotFound(name) => write!(f, "{name} is not installed on this computer"),
            LaunchError::Failed(why) => write!(f, "{why}"),
        }
    }
}

pub const HOSTED_FLAG: &str = "--formtray-hosted";
pub const HOSTED_ENV: &str = "FORMTRAY_HOSTED";
pub const HOSTED_ENV_VALUE: &str = "1";

fn detached(mut command: Command) -> Result<(), LaunchError> {
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    command.spawn().map(|_| ()).map_err(|e| LaunchError::Failed(e.to_string()))
}

pub fn open(app: &AppEntry, path: Option<&Path>, running: &[u32]) -> Result<(), LaunchError> {
    if cfg!(target_os = "macos") {
        let hosted = running.is_empty();
        let env_pair = format!("{HOSTED_ENV}={HOSTED_ENV_VALUE}");
        let attempt = |env_first: bool, target: &[&std::ffi::OsStr]| {
            let forms: Vec<Vec<&std::ffi::OsStr>> = if hosted {
                let env = [std::ffi::OsStr::new("--env"), std::ffi::OsStr::new(&env_pair)];
                let tail = [std::ffi::OsStr::new("--args"), std::ffi::OsStr::new(HOSTED_FLAG)];
                let mut with_env: Vec<&std::ffi::OsStr> = Vec::new();
                if env_first {
                    with_env.extend_from_slice(&env);
                    with_env.extend_from_slice(target);
                } else {
                    with_env.extend_from_slice(target);
                    with_env.extend_from_slice(&env);
                }
                with_env.extend_from_slice(&tail);
                let mut without_env = target.to_vec();
                without_env.extend_from_slice(&tail);
                vec![with_env, without_env, target.to_vec()]
            } else {
                vec![target.to_vec()]
            };
            forms.into_iter().any(|form| {
                let mut command = Command::new("open");
                command.args(form);
                command.stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok_and(|s| s.success())
            })
        };
        if let Some(p) = path {
            if attempt(true, &[p.as_os_str()]) {
                return Ok(());
            }
        }
        for id in &app.identifiers {
            if attempt(false, &[std::ffi::OsStr::new("-b"), std::ffi::OsStr::new(id)]) {
                return Ok(());
            }
        }
        return Err(LaunchError::NotFound(app.name.clone()));
    }
    if !running.is_empty() && focus(running) {
        return Ok(());
    }
    let path = path.ok_or_else(|| LaunchError::NotFound(app.name.clone()))?;
    let mut command = Command::new(path);
    command.arg(HOSTED_FLAG).env(HOSTED_ENV, HOSTED_ENV_VALUE);
    if let Some(parent) = path.parent() {
        command.current_dir(parent);
    }
    detached(command)
}

#[cfg(target_os = "windows")]
fn focus(pids: &[u32]) -> bool {
    use windows_sys::core::BOOL;
    use windows_sys::Win32::Foundation::{HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow, SW_RESTORE,
    };
    struct Search {
        pids: Vec<u32>,
        found: HWND,
    }
    unsafe extern "system" fn each(hwnd: HWND, data: LPARAM) -> BOOL {
        let search = &mut *(data as *mut Search);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if search.pids.contains(&pid) && IsWindowVisible(hwnd) != 0 {
            search.found = hwnd;
            return 0;
        }
        1
    }
    let mut search = Search { pids: pids.to_vec(), found: std::ptr::null_mut() };
    unsafe {
        EnumWindows(Some(each), &mut search as *mut Search as LPARAM);
        if search.found.is_null() {
            return false;
        }
        if IsIconic(search.found) != 0 {
            ShowWindow(search.found, SW_RESTORE);
        }
        SetForegroundWindow(search.found) != 0
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn focus(pids: &[u32]) -> bool {
    pids.iter().any(|pid| {
        Command::new("xdotool")
            .args(["search", "--onlyvisible", "--pid", &pid.to_string(), "windowactivate"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
    })
}

#[cfg(target_os = "macos")]
fn focus(_pids: &[u32]) -> bool {
    false
}

pub fn quit(app: &AppEntry, running: &[u32]) -> Result<(), LaunchError> {
    if cfg!(target_os = "macos") {
        for id in &app.identifiers {
            let script = format!("tell application id \"{id}\" to quit");
            if Command::new("osascript").args(["-e", &script]).stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok_and(|s| s.success()) {
                return Ok(());
            }
        }
    }
    if running.is_empty() {
        return Err(LaunchError::Failed(format!("{} is not running", app.name)));
    }
    let system = sysinfo::System::new_all();
    for pid in running {
        if let Some(process) = system.process(sysinfo::Pid::from_u32(*pid)) {
            if process.kill_with(sysinfo::Signal::Term).is_none() {
                process.kill();
            }
        }
    }
    Ok(())
}
