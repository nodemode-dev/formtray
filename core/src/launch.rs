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

fn detached(mut command: Command) -> Result<(), LaunchError> {
    command.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    command.spawn().map(|_| ()).map_err(|e| LaunchError::Failed(e.to_string()))
}

pub fn open(app: &AppEntry, path: Option<&Path>, running: &[u32]) -> Result<(), LaunchError> {
    if cfg!(target_os = "macos") {
        let quiet = |mut c: Command| c.stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok_and(|s| s.success());
        if let Some(p) = path {
            let mut command = Command::new("open");
            command.arg(p);
            if quiet(command) {
                return Ok(());
            }
        }
        for id in &app.identifiers {
            let mut command = Command::new("open");
            command.args(["-b", id]);
            if quiet(command) {
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
    if let Some(parent) = path.parent() {
        command.current_dir(parent);
    }
    detached(command)
}

#[cfg(target_os = "windows")]
fn focus(pids: &[u32]) -> bool {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
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
