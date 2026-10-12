use std::collections::HashMap;
use std::path::Path;

use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System, UpdateKind};

use crate::registry::{AppEntry, Registry};

#[derive(Debug, Clone, Default)]
pub struct Running {
    pub pids: Vec<u32>,
    pub since: u64,
}

pub struct Watcher {
    system: System,
}

impl Default for Watcher {
    fn default() -> Self {
        Self::new()
    }
}

impl Watcher {
    pub fn new() -> Watcher {
        Watcher { system: System::new_with_specifics(RefreshKind::nothing()) }
    }

    pub fn scan(&mut self, registry: &Registry) -> HashMap<String, Running> {
        self.system.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet));
        let mut out: HashMap<String, Running> = HashMap::new();
        for (pid, process) in self.system.processes() {
            if process.thread_kind().is_some() {
                continue;
            }
            let Some(app) = registry.apps.iter().find(|a| owns(a, process.exe(), &process.name().to_string_lossy())) else {
                continue;
            };
            let entry = out.entry(app.id.clone()).or_default();
            entry.pids.push(pid.as_u32());
            let started = process.start_time();
            if entry.since == 0 || started < entry.since {
                entry.since = started;
            }
        }
        out
    }
}

fn owns(app: &AppEntry, exe: Option<&Path>, name: &str) -> bool {
    if let Some(exe) = exe {
        let text = exe.to_string_lossy();
        if app.names.iter().any(|n| text.contains(&format!("/{n}.app/Contents/MacOS/"))) {
            return true;
        }
        if text.contains(".app/Contents/MacOS/") {
            return false;
        }
        if let Some(stem) = exe.file_stem() {
            let stem = stem.to_string_lossy();
            let base = stem.split(['_', '-']).next().unwrap_or(&stem);
            if app.matches_name(&stem) || (stem.ends_with(".AppImage") && app.matches_name(base)) {
                return true;
            }
        }
        return false;
    }
    app.matches_name(name.trim_end_matches(".exe"))
}
