use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub const VIEWS: [&str; 5] = ["switcher", "stack", "apps", "windows", "widgets"];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Tile {
    #[serde(default = "Tile::default_kind")]
    pub kind: String,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub app: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub apps: Vec<String>,
    #[serde(default = "Tile::default_size")]
    pub size: String,
}

impl Tile {
    fn default_size() -> String {
        "m".to_string()
    }
    fn default_kind() -> String {
        "app".to_string()
    }
    pub fn app(app: &str, size: &str) -> Tile {
        Tile { kind: "app".into(), id: app.into(), app: app.into(), name: String::new(), apps: Vec::new(), size: size.into() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Prefs {
    pub default_view: String,
    pub open_at_login: bool,
    pub hidden: Vec<String>,
    pub pinned: Vec<String>,
    pub locations: Vec<PathBuf>,
    pub widgets: Vec<Tile>,
    pub hotkeys: HashMap<String, String>,
}

impl Default for Prefs {
    fn default() -> Self {
        let board = ["formvis", "formcut", "formwav", "formdeck", "formlit", "formdam", "formweb", "formportal"];
        Prefs {
            default_view: "apps".to_string(),
            open_at_login: false,
            hidden: Vec::new(),
            pinned: board.iter().map(|s| s.to_string()).collect(),
            locations: Vec::new(),
            widgets: board.iter().enumerate().map(|(i, a)| Tile::app(a, if i < 2 { "l" } else { "m" })).collect(),
            hotkeys: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Use {
    pub count: u32,
    pub last: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Usage {
    pub apps: HashMap<String, Use>,
    pub last_view: String,
}

pub fn dir() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(std::env::temp_dir);
    if cfg!(target_os = "linux") {
        base.join("formdock")
    } else {
        base.join("ai.nodemode.formdock")
    }
}

fn read<T: for<'de> Deserialize<'de> + Default>(name: &str) -> T {
    std::fs::read_to_string(dir().join(name)).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

fn write<T: Serialize>(name: &str, value: &T) -> std::io::Result<()> {
    let folder = dir();
    std::fs::create_dir_all(&folder)?;
    let tmp = folder.join(format!("{name}.tmp"));
    std::fs::write(&tmp, serde_json::to_vec_pretty(value)?)?;
    std::fs::rename(tmp, folder.join(name))
}

impl Prefs {
    pub fn load() -> Prefs {
        let mut prefs: Prefs = read("prefs.json");
        if !VIEWS.contains(&prefs.default_view.as_str()) {
            prefs.default_view = "apps".into();
        }
        prefs
    }
    pub fn save(&self) -> std::io::Result<()> {
        write("prefs.json", self)
    }
}

impl Usage {
    pub fn load() -> Usage {
        read("usage.json")
    }
    pub fn save(&self) -> std::io::Result<()> {
        write("usage.json", self)
    }
    pub fn touch(&mut self, id: &str) {
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let entry = self.apps.entry(id.to_string()).or_default();
        entry.count += 1;
        entry.last = now;
    }
}
