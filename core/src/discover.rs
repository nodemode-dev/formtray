use std::path::{Path, PathBuf};

use crate::registry::AppEntry;

pub fn search_roots(extra: &[PathBuf]) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = extra.to_vec();
    let home = dirs::home_dir();
    if cfg!(target_os = "macos") {
        roots.push(PathBuf::from("/Applications"));
        if let Some(h) = &home {
            roots.push(h.join("Applications"));
        }
    } else if cfg!(target_os = "windows") {
        if let Some(local) = dirs::data_local_dir() {
            roots.push(local.join("Programs"));
            roots.push(local);
        }
        for var in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(p) = std::env::var(var) {
                roots.push(PathBuf::from(p));
            }
        }
    } else {
        if let Some(h) = &home {
            roots.push(h.join("Applications"));
            roots.push(h.join(".local/bin"));
            roots.push(h.join(".local/share/applications"));
        }
        for p in ["/usr/bin", "/usr/local/bin", "/opt", "/usr/share/applications"] {
            roots.push(PathBuf::from(p));
        }
    }
    roots.into_iter().filter(|r| r.is_dir()).collect()
}

pub fn resolve(app: &AppEntry, path: &Path) -> Option<PathBuf> {
    if path.is_dir() && !is_bundle(path) {
        return scan(app, path, 0);
    }
    candidate(app, path).or_else(|| path.exists().then(|| path.to_path_buf()))
}

pub fn find(app: &AppEntry, roots: &[PathBuf]) -> Option<PathBuf> {
    roots.iter().find_map(|root| scan(app, root, 0))
}

fn scan(app: &AppEntry, dir: &Path, depth: u8) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    let mut nested = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(hit) = candidate(app, &path) {
            return Some(hit);
        }
        if depth < 1 && path.is_dir() && !is_bundle(&path) {
            nested.push(path);
        }
    }
    nested.into_iter().find_map(|p| scan(app, &p, depth + 1))
}

fn is_bundle(path: &Path) -> bool {
    path.extension().is_some_and(|e| e == "app")
}

fn stem(path: &Path) -> String {
    path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
}

#[cfg(target_os = "macos")]
fn candidate(app: &AppEntry, path: &Path) -> Option<PathBuf> {
    if !is_bundle(path) {
        return None;
    }
    let info = path.join("Contents/Info.plist");
    if let Ok(value) = plist::Value::from_file(&info) {
        if let Some(id) = value.as_dictionary().and_then(|d| d.get("CFBundleIdentifier")).and_then(|v| v.as_string()) {
            if app.identifiers.iter().any(|i| i == id) {
                return Some(path.to_path_buf());
            }
            if id.starts_with("ai.nodemode.") || id.starts_with("dev.formai.") || id.starts_with("app.formcut.") {
                return None;
            }
        }
    }
    app.matches_name(&stem(path)).then(|| path.to_path_buf())
}

#[cfg(target_os = "windows")]
fn candidate(app: &AppEntry, path: &Path) -> Option<PathBuf> {
    if path.is_dir() && app.matches_name(&stem(path)) {
        return app.names.iter().map(|n| path.join(format!("{n}.exe"))).find(|p| p.is_file());
    }
    let is_exe = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe"));
    (is_exe && app.matches_name(&stem(path))).then(|| path.to_path_buf())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn candidate(app: &AppEntry, path: &Path) -> Option<PathBuf> {
    let ext = path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    if ext == "desktop" {
        let text = std::fs::read_to_string(path).ok()?;
        let exec = text.lines().find_map(|l| l.strip_prefix("Exec="))?;
        let program = exec.split_whitespace().next()?;
        let program_stem = stem(Path::new(program));
        return app.matches_name(&program_stem).then(|| PathBuf::from(program)).and_then(|p| which(&p));
    }
    if path.is_file() && (ext.is_empty() || ext == "appimage") {
        let name = stem(path);
        let base = name.split(['_', '-']).next().unwrap_or(&name).to_string();
        if app.matches_name(&name) || (ext == "appimage" && app.matches_name(&base)) {
            return Some(path.to_path_buf());
        }
    }
    None
}

#[cfg(all(unix, not(target_os = "macos")))]
fn which(program: &Path) -> Option<PathBuf> {
    if program.is_absolute() {
        return program.is_file().then(|| program.to_path_buf());
    }
    std::env::var_os("PATH").and_then(|paths| std::env::split_paths(&paths).map(|d| d.join(program)).find(|p| p.is_file()))
}
