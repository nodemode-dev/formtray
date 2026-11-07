pub mod discover;
pub mod extensions;
pub mod hotkeys;
pub mod identity;
pub mod launch;
pub mod portal;
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
    pub live_icon: String,
    pub name_source: &'static str,
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
    pub portal: bool,
    pub updates: Vec<portal::PortalUpdate>,
    pub last_view: String,
}

pub struct Engine {
    pub registry: Registry,
    pub prefs: Prefs,
    pub usage: Usage,
    portal: portal::PortalState,
    paths: HashMap<String, Option<PathBuf>>,
    identities: HashMap<String, identity::Identity>,
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
            portal: portal::PortalState::default(),
            paths: HashMap::new(),
            identities: HashMap::new(),
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
        self.portal = portal::read();
        self.registry = Registry::load();
        let roots = discover::search_roots(&self.prefs.locations);
        let cache = identity::cache_dir();
        let portal = &self.portal;
        self.paths = self
            .registry
            .apps
            .iter()
            .map(|a| {
                let managed = portal.installs.iter().find(|(id, _)| id == &a.id).and_then(|(_, p)| discover::resolve(a, p));
                (a.id.clone(), managed.or_else(|| discover::find(a, &roots)))
            })
            .collect();
        self.identities = self
            .registry
            .apps
            .iter()
            .filter_map(|a| self.paths.get(&a.id).cloned().flatten().map(|p| (a.id.clone(), identity::read_into(a, &p, &cache))))
            .collect();
    }

    pub fn display_name(&self, app: &AppEntry) -> (String, &'static str) {
        let live = self.identities.get(&app.id).and_then(|i| i.name.as_deref()).and_then(|n| identity::form_name(Some(app), n));
        if let Some(name) = live {
            return (name, "app");
        }
        if let Some(name) = self.portal.names.get(&app.id).and_then(|n| identity::form_name(Some(app), n)) {
            return (name, "portal");
        }
        (app.name.clone(), "registry")
    }

    pub fn menu_icon(&self, id: &str) -> Option<PathBuf> {
        let icon = self.identities.get(id)?.icon.as_deref()?;
        identity::menu_icon(&identity::cache_dir(), icon)
    }

    pub fn set_hotkey(&mut self, action: &str, chord: &str) -> Result<(), String> {
        if !hotkeys::ACTIONS.contains(&action) {
            return Err(format!("{action} is not a FormTray action"));
        }
        let mut prefs = self.prefs.clone();
        if chord.trim().is_empty() {
            prefs.hotkeys.remove(action);
        } else {
            let wanted = hotkeys::normalise(chord);
            if let Some(owner) = hotkeys::conflict(&wanted) {
                return Err(format!("{wanted} is used by {owner}"));
            }
            let taken = hotkeys::effective(&prefs.hotkeys).into_iter().find(|(a, c)| a != action && hotkeys::normalise(c).eq_ignore_ascii_case(&wanted));
            if let Some((other, _)) = taken {
                return Err(format!("{wanted} is already FormTray's {other} hotkey"));
            }
            prefs.hotkeys.insert(action.to_string(), wanted);
        }
        self.set_prefs(prefs).map_err(|e| e.to_string())
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
            .filter(|a| self.is_released(a))
            .map(|a| {
                let run = self.running.get(&a.id);
                let used = self.usage.apps.get(&a.id);
                let path = self.paths.get(&a.id).cloned().flatten();
                let (name, name_source) = self.display_name(a);
                AppState {
                    id: a.id.clone(),
                    name,
                    alt_of: a.alt_of.clone(),
                    category: a.category.clone(),
                    hue: a.hue.clone(),
                    icon: a.icon.clone(),
                    live_icon: self.identities.get(&a.id).and_then(|i| i.icon.clone()).unwrap_or_default(),
                    name_source,
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
            portal: self.portal.found,
            updates: self.portal.updates.clone(),
            last_view: self.last_view(),
        }
    }

    fn is_released(&self, app: &AppEntry) -> bool {
        if app.id == "formtray" {
            return false;
        }
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        app.released_at(now) || self.portal.released.contains(&app.id)
    }

    fn entry(&self, id: &str) -> Result<AppEntry, LaunchError> {
        self.registry.get(id).filter(|a| self.is_released(a)).cloned().ok_or_else(|| LaunchError::NotFound(id.to_string()))
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
