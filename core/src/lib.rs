pub mod discover;
pub mod hotkeys;
pub mod launch;
pub mod prefs;
pub mod registry;
pub mod running;

use std::collections::HashMap;
use std::path::PathBuf;

use serde::Serialize;

pub use launch::LaunchError;
pub use prefs::{Prefs, Tile, Usage, VIEWS};
pub use registry::{AppEntry, Category, Registry};

#[derive(Debug, Clone, Serialize)]
pub struct AppState {
    pub id: String,
    pub name: String,
    pub alt_of: String,
    pub category: String,
    pub hue: String,
    pub icon: String,
    pub installed: bool,
    pub path: Option<PathBuf>,
    pub running: bool,
    pub processes: usize,
    pub since: u64,
    pub count: u32,
    pub last: u64,
    pub hidden: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Snapshot {
    pub categories: Vec<Category>,
    pub apps: Vec<AppState>,
    pub prefs: Prefs,
    pub hotkeys: HashMap<String, String>,
    pub platform: &'static str,
}

pub struct Engine {
    pub registry: Registry,
    pub prefs: Prefs,
    pub usage: Usage,
    paths: HashMap<String, Option<PathBuf>>,
    running: HashMap<String, running::Running>,
    watcher: running::Watcher,
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

impl Engine {
    pub fn new() -> Engine {
        let mut engine = Engine {
            registry: Registry::load(),
            prefs: Prefs::load(),
            usage: Usage::load(),
            paths: HashMap::new(),
            running: HashMap::new(),
            watcher: running::Watcher::new(),
        };
        engine.rediscover();
        engine.refresh_running();
        engine
    }

    pub fn platform() -> &'static str {
        if cfg!(target_os = "macos") {
            "macos"
        } else if cfg!(target_os = "windows") {
            "windows"
        } else {
            "linux"
        }
    }

    pub fn rediscover(&mut self) {
        let roots = discover::search_roots(&self.prefs.locations);
        self.paths = self.registry.apps.iter().map(|a| (a.id.clone(), discover::find(a, &roots))).collect();
    }

    pub fn refresh_running(&mut self) -> bool {
        let next = self.watcher.scan(&self.registry);
        let changed = next.len() != self.running.len() || next.iter().any(|(k, v)| self.running.get(k).map(|o| o.pids.len()) != Some(v.pids.len()));
        self.running = next;
        changed
    }

    pub fn snapshot(&self) -> Snapshot {
        let apps = self
            .registry
            .apps
            .iter()
            .map(|a| {
                let run = self.running.get(&a.id);
                let used = self.usage.apps.get(&a.id);
                let path = self.paths.get(&a.id).cloned().flatten();
                AppState {
                    id: a.id.clone(),
                    name: a.name.clone(),
                    alt_of: a.alt_of.clone(),
                    category: a.category.clone(),
                    hue: a.hue.clone(),
                    icon: a.icon.clone(),
                    installed: path.is_some() || run.is_some(),
                    path,
                    running: run.is_some(),
                    processes: run.map(|r| r.pids.len()).unwrap_or(0),
                    since: run.map(|r| r.since).unwrap_or(0),
                    count: used.map(|u| u.count).unwrap_or(0),
                    last: used.map(|u| u.last).unwrap_or(0),
                    hidden: self.prefs.hidden.contains(&a.id),
                }
            })
            .collect();
        Snapshot {
            categories: self.registry.categories.clone(),
            apps,
            prefs: self.prefs.clone(),
            hotkeys: hotkeys::effective(&self.prefs.hotkeys),
            platform: Self::platform(),
        }
    }

    fn entry(&self, id: &str) -> Result<AppEntry, LaunchError> {
        self.registry.get(id).cloned().ok_or_else(|| LaunchError::NotFound(id.to_string()))
    }

    pub fn open(&mut self, id: &str) -> Result<String, LaunchError> {
        let app = self.entry(id)?;
        let path = self.paths.get(&app.id).cloned().flatten();
        let pids = self.running.get(&app.id).map(|r| r.pids.clone()).unwrap_or_default();
        launch::open(&app, path.as_deref(), &pids)?;
        self.usage.touch(&app.id);
        let _ = self.usage.save();
        Ok(app.id)
    }

    pub fn quit(&mut self, id: &str) -> Result<(), LaunchError> {
        let app = self.entry(id)?;
        let pids = self.running.get(&app.id).map(|r| r.pids.clone()).unwrap_or_default();
        launch::quit(&app, &pids)
    }

    pub fn set_prefs(&mut self, prefs: Prefs) -> std::io::Result<()> {
        let relocate = prefs.locations != self.prefs.locations;
        self.prefs = prefs;
        self.prefs.save()?;
        if relocate {
            self.rediscover();
        }
        Ok(())
    }

    pub fn note_view(&mut self, view: &str) {
        if VIEWS.contains(&view) && self.usage.last_view != view {
            self.usage.last_view = view.to_string();
            let _ = self.usage.save();
        }
    }

    pub fn last_view(&self) -> String {
        if VIEWS.contains(&self.usage.last_view.as_str()) {
            self.usage.last_view.clone()
        } else {
            self.prefs.default_view.clone()
        }
    }
}
