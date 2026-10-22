use serde::{Deserialize, Serialize};

const DATA: &str = include_str!("../data/apps.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub alt_of: String,
    pub category: String,
    pub hue: String,
    #[serde(default)]
    pub icon: String,
    pub identifiers: Vec<String>,
    pub names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Registry {
    #[serde(default)]
    pub excluded: Vec<String>,
    pub categories: Vec<Category>,
    pub apps: Vec<AppEntry>,
}

impl Registry {
    pub fn load() -> Registry {
        serde_json::from_str(DATA).expect("core/data/apps.json is valid")
    }

    pub fn get(&self, id: &str) -> Option<&AppEntry> {
        let wanted = id.to_ascii_lowercase();
        self.apps.iter().find(|a| {
            a.id == wanted || a.name.eq_ignore_ascii_case(&wanted) || a.names.iter().any(|n| n.eq_ignore_ascii_case(&wanted))
        })
    }
}

impl AppEntry {
    pub fn matches_name(&self, candidate: &str) -> bool {
        self.names.iter().any(|n| n.eq_ignore_ascii_case(candidate)) || self.name.eq_ignore_ascii_case(candidate)
    }
}
