use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct PortalUpdate {
    pub id: String,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct PortalState {
    pub found: bool,
    pub installs: Vec<(String, PathBuf)>,
    pub updates: Vec<PortalUpdate>,
    pub names: std::collections::HashMap<String, String>,
}

#[derive(Deserialize)]
struct Installed {
    #[serde(default)]
    installs: Vec<Install>,
}

#[derive(Deserialize)]
struct Install {
    product: String,
    channel: String,
    current: Version,
}

#[derive(Deserialize)]
struct Version {
    version: String,
    path: PathBuf,
}

#[derive(Deserialize)]
struct Catalog {
    #[serde(default)]
    products: Vec<Product>,
}

#[derive(Deserialize)]
struct Product {
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    channels: std::collections::HashMap<String, Release>,
}

#[derive(Deserialize)]
struct Release {
    version: String,
    #[serde(default)]
    artifacts: Vec<Artifact>,
}

#[derive(Deserialize)]
struct Artifact {
    platform: String,
}

pub fn root() -> PathBuf {
    if let Some(root) = std::env::var_os("FORMPORTAL_ROOT") {
        return PathBuf::from(root);
    }
    let home = dirs::home_dir().unwrap_or_default();
    if cfg!(target_os = "macos") {
        home.join("Library/Application Support/dev.formai.portal")
    } else if cfg!(target_os = "windows") {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|| home.join("AppData/Local")).join("FormPortal")
    } else {
        std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".local/share")).join("formportal")
    }
}

pub fn family_id(product: &str) -> String {
    match product {
        "formai" => "formportal".to_string(),
        "formslide" => "formdeck".to_string(),
        other => other.to_string(),
    }
}

fn platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

pub fn newer(candidate: &str, current: &str) -> bool {
    let parts = |v: &str| -> Vec<u64> {
        let v = v.trim().trim_start_matches('v');
        let core = v.split(['-', '+']).next().unwrap_or(v);
        core.split('.').map(|n| n.parse().unwrap_or(0)).collect()
    };
    let (a, b) = (parts(candidate), parts(current));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (a.get(i).copied().unwrap_or(0), b.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    false
}

pub fn read() -> PortalState {
    read_at(&root())
}

pub fn read_at(root: &Path) -> PortalState {
    let Some(installed) = std::fs::read_to_string(root.join("installed.json")).ok().and_then(|t| serde_json::from_str::<Installed>(&t).ok()) else {
        return PortalState::default();
    };
    let catalog = std::fs::read_to_string(root.join("catalog/apps.json")).ok().and_then(|t| serde_json::from_str::<Catalog>(&t).ok());
    let mut state = PortalState { found: true, ..PortalState::default() };
    for product in catalog.iter().flat_map(|c| c.products.iter()).filter(|p| !p.name.trim().is_empty()) {
        state.names.insert(family_id(&product.id), product.name.trim().to_string());
    }
    for install in installed.installs.iter().filter(|i| i.channel == "stable") {
        let id = family_id(&install.product);
        state.installs.push((id.clone(), install.current.path.clone()));
        let latest = catalog
            .as_ref()
            .and_then(|c| c.products.iter().find(|p| p.id == install.product))
            .and_then(|p| p.channels.get("stable"))
            .filter(|r| r.artifacts.iter().any(|a| a.platform == platform()));
        if let Some(release) = latest {
            if newer(&release.version, &install.current.version) {
                state.updates.push(PortalUpdate { id, from: install.current.version.clone(), to: release.version.clone() });
            }
        }
    }
    state
}
