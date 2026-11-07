use std::path::{Path, PathBuf};
use std::time::{Duration, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

pub const API: &str = "1";
pub const PRODUCT: &str = "formtray";
pub const APP_NAME: &str = "FormTray";

pub const TYPES: &[(&str, &str)] = &[
    (".html", "text/html; charset=utf-8"),
    (".js", "text/javascript; charset=utf-8"),
    (".mjs", "text/javascript; charset=utf-8"),
    (".css", "text/css; charset=utf-8"),
    (".json", "application/json"),
    (".svg", "image/svg+xml"),
    (".png", "image/png"),
    (".webp", "image/webp"),
    (".jpg", "image/jpeg"),
    (".jpeg", "image/jpeg"),
    (".gif", "image/gif"),
    (".wasm", "application/wasm"),
    (".txt", "text/plain; charset=utf-8"),
    (".md", "text/markdown; charset=utf-8"),
    (".wav", "audio/wav"),
    (".ogg", "audio/ogg"),
    (".mp3", "audio/mpeg"),
    (".webm", "video/webm"),
    (".mp4", "video/mp4"),
    (".cube", "text/plain; charset=utf-8"),
    (".woff2", "font/woff2"),
];
pub const PERMISSIONS: &[&str] = &["document", "files-read", "files-write", "network", "models", "native-code"];

fn id_ok(s: &str) -> bool {
    let b = s.as_bytes();
    (2..=64).contains(&b.len()) && (b[0].is_ascii_lowercase() || b[0].is_ascii_digit()) && b[1..].iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
}

fn local_ok(s: &str) -> bool {
    let b = s.as_bytes();
    (1..=32).contains(&b.len()) && (b[0].is_ascii_lowercase() || b[0].is_ascii_digit()) && b[1..].iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
}

fn version_ok(s: &str) -> bool {
    let parts: Vec<&str> = s.split('.').collect();
    parts.len() == 3 && parts.iter().all(|p| !p.is_empty() && p.bytes().all(|c| c.is_ascii_digit()))
}

pub fn portal_root() -> PathBuf {
    if let Some(env) = std::env::var_os("FORMPORTAL_ROOT") {
        let text = env.to_string_lossy().trim().to_string();
        if !text.is_empty() {
            return PathBuf::from(text);
        }
    }
    let home = dirs::home_dir().unwrap_or_default();
    if cfg!(target_os = "macos") {
        let support = home.join("Library").join("Application Support");
        let (new, old) = (support.join("studio.formai.portal"), support.join("dev.formai.portal"));
        return if old.is_dir() && !new.exists() { old } else { new };
    }
    if cfg!(target_os = "windows") {
        let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|| home.join("AppData").join("Local"));
        return base.join("FormPortal");
    }
    let base = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".local").join("share"));
    base.join("formportal")
}

pub fn version_tuple(v: &str) -> Vec<i64> {
    let parsed: Result<Vec<i64>, _> = v.split('.').take(3).map(|p| p.trim().parse::<i64>()).collect();
    parsed.unwrap_or_else(|_| vec![0, 0, 0])
}

#[derive(Debug, Clone, Serialize)]
pub struct Extension {
    pub id: String,
    pub version: String,
    pub source: String,
    pub path: PathBuf,
    pub name: String,
    pub kind: String,
    pub description: String,
    pub permissions: Vec<String>,
    pub entry_ui: String,
    pub panels: Vec<Value>,
    pub commands: Vec<Value>,
    pub state: String,
    pub reason: String,
}

impl Extension {
    fn new(id: &str, version: &str, source: &str, path: PathBuf) -> Extension {
        Extension {
            id: id.to_string(),
            version: version.to_string(),
            source: source.to_string(),
            path,
            name: String::new(),
            kind: String::new(),
            description: String::new(),
            permissions: Vec::new(),
            entry_ui: String::new(),
            panels: Vec::new(),
            commands: Vec::new(),
            state: "ready".to_string(),
            reason: String::new(),
        }
    }

    pub fn public(&self, base: &str) -> Value {
        json!({
            "id": self.id,
            "name": if self.name.is_empty() { &self.id } else { &self.name },
            "version": self.version,
            "kind": self.kind,
            "source": self.source,
            "description": self.description,
            "permissions": self.permissions,
            "base": format!("{base}/{}/{}/", self.id, self.version),
            "entryUi": self.entry_ui,
            "panels": self.panels,
            "commands": self.commands,
            "path": if self.source == "development" { Some(self.path.display().to_string()) } else { None },
            "state": self.state,
            "reason": self.reason,
        })
    }
}

fn read_json(path: &Path) -> Option<Value> {
    std::fs::read_to_string(path).ok().and_then(|t| serde_json::from_str(&t).ok())
}

fn safe_rel(rel: &str) -> bool {
    !rel.is_empty() && !rel.starts_with('/') && !rel.contains('\\') && !rel.split('/').any(|p| p == "..") && rel.chars().count() <= 200
}

fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(a)) => !a.is_empty(),
        Some(Value::Object(o)) => !o.is_empty(),
    }
}

fn py_str(v: Option<&Value>) -> String {
    match v {
        None | Some(Value::Null) => "None".to_string(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Bool(true)) => "True".to_string(),
        Some(Value::Bool(false)) => "False".to_string(),
        Some(other) => other.to_string(),
    }
}

fn py_repr(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => format!("'{s}'"),
        other => py_str(other),
    }
}

fn clip(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

fn canonical(p: &Path) -> PathBuf {
    std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf())
}

fn inside(root: &Path, target: &Path) -> bool {
    target != root && target.starts_with(root)
}

pub fn check(mut ext: Extension, product: &str, app_version: &str, app_name: &str) -> Extension {
    let refuse = |mut ext: Extension, reason: String| -> Extension {
        ext.state = "refused".to_string();
        ext.reason = reason;
        ext
    };

    let manifest = match read_json(&ext.path.join("manifest.json")) {
        Some(Value::Object(m)) => m,
        _ => return refuse(ext, "its manifest.json is missing or not valid JSON".to_string()),
    };
    let one = match manifest.get("format_version") {
        Some(Value::Number(n)) => n.as_f64() == Some(1.0),
        Some(Value::Bool(b)) => *b,
        _ => false,
    };
    if manifest.get("format").and_then(Value::as_str) != Some("formai-package") || !one {
        return refuse(ext, "it is not a formai package".to_string());
    }
    ext.name = clip(&if truthy(manifest.get("name")) { py_str(manifest.get("name")) } else { ext.id.clone() }, 80);
    ext.kind = if truthy(manifest.get("kind")) { py_str(manifest.get("kind")) } else { String::new() };
    ext.description = clip(&if truthy(manifest.get("description")) { py_str(manifest.get("description")) } else { String::new() }, 400);
    let early = match manifest.get("version") {
        None => String::new(),
        v => py_str(v),
    };
    if ext.source == "development" && version_ok(&early) {
        ext.version = early;
    }
    if manifest.get("id").and_then(Value::as_str) != Some(ext.id.as_str()) {
        let said = py_repr(manifest.get("id"));
        let want = format!("'{}'", ext.id);
        return refuse(ext, format!("its manifest says {said}, not {want}"));
    }
    if manifest.get("product").and_then(Value::as_str) != Some(product) {
        return refuse(ext, format!("it is made for {}, not {app_name}", py_str(manifest.get("product"))));
    }
    let said_version = match manifest.get("version") {
        None => String::new(),
        v => py_str(v),
    };
    if said_version != ext.version && ext.source != "development" {
        let reason = format!("its manifest says version {}, FormPortal says {}", py_str(manifest.get("version")), ext.version);
        return refuse(ext, reason);
    }
    if truthy(manifest.get("version")) {
        ext.version = py_str(manifest.get("version"));
    }
    if !version_ok(&ext.version) {
        return refuse(ext, "its version is not x.y.z".to_string());
    }
    if manifest.get("api").and_then(Value::as_str) != Some(API) {
        return refuse(ext, format!("it needs extension API {}; this {app_name} offers API {API}", py_str(manifest.get("api"))));
    }
    if truthy(manifest.get("native")) {
        return refuse(ext, format!("native extensions are not supported by {app_name}"));
    }
    let perms = if truthy(manifest.get("permissions")) { manifest.get("permissions").cloned().unwrap_or(Value::Null) } else { Value::Array(Vec::new()) };
    let Some(list) = perms.as_array() else {
        return refuse(ext, "it asks for a permission that does not exist".to_string());
    };
    if list.iter().any(|p| !p.as_str().is_some_and(|s| PERMISSIONS.contains(&s))) {
        return refuse(ext, "it asks for a permission that does not exist".to_string());
    }
    let mut unique: Vec<String> = Vec::new();
    for p in list.iter().filter_map(Value::as_str) {
        if !unique.iter().any(|u| u == p) {
            unique.push(p.to_string());
        }
    }
    ext.permissions = unique;
    let minimum = manifest.get("minimum_app");
    if truthy(minimum) && version_tuple(&py_str(minimum)) > version_tuple(app_version) {
        return refuse(ext, format!("it needs {app_name} {} or newer", py_str(minimum)));
    }
    let empty = Map::new();
    let entry_obj = manifest.get("entry").and_then(Value::as_object).unwrap_or(&empty);
    let entry_value = entry_obj.get("ui").cloned().unwrap_or(Value::String(String::new()));
    if !entry_value.is_string() {
        return refuse(ext, "its entry.ui is not a path inside the package".to_string());
    }
    let contributes = manifest.get("contributes").and_then(Value::as_object).unwrap_or(&empty);
    let listed = |key: &str| -> Vec<Map<String, Value>> {
        contributes
            .get(key)
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_object).filter(|o| local_ok(&py_str(o.get("id"))) && truthy(o.get("title"))).cloned().collect())
            .unwrap_or_default()
    };
    let panels = listed("panels");
    let commands = listed("commands");
    let has_entry = truthy(Some(&entry_value));
    if (!panels.is_empty() || !commands.is_empty()) && !has_entry {
        return refuse(ext, "it contributes panels or commands but has no entry.ui".to_string());
    }
    let mut entry = String::new();
    if has_entry {
        let text = entry_value.as_str().unwrap_or_default();
        if !safe_rel(text) {
            return refuse(ext, "its entry.ui is not a path inside the package".to_string());
        }
        let target = canonical(&ext.path.join(text));
        if !target.is_file() || !inside(&canonical(&ext.path), &target) {
            return refuse(ext, format!("its entry.ui {text} is not in the package"));
        }
        entry = text.to_string();
    }
    ext.entry_ui = entry;
    ext.panels = panels
        .iter()
        .map(|p| {
            let location = match p.get("location").and_then(Value::as_str) {
                Some(l @ ("dock" | "dialog")) => l,
                _ => "dock",
            };
            json!({ "id": py_str(p.get("id")), "title": clip(&py_str(p.get("title")), 60), "location": location })
        })
        .collect();
    ext.commands = commands
        .iter()
        .map(|c| {
            let mut out = Map::new();
            out.insert("id".into(), Value::String(py_str(c.get("id"))));
            out.insert("title".into(), Value::String(clip(&py_str(c.get("title")), 80)));
            if truthy(c.get("panel")) {
                out.insert("panel".into(), c.get("panel").cloned().unwrap_or(Value::Null));
            }
            Value::Object(out)
        })
        .collect();
    ext
}

pub fn resolve(product: &str, app_version: &str, app_name: &str, root: Option<&Path>) -> Vec<Extension> {
    let folder = root.map(Path::to_path_buf).unwrap_or_else(portal_root).join("extensions").join(product);
    let mut found: Vec<Extension> = Vec::new();
    let mut put = |ext: Extension| {
        if let Some(slot) = found.iter_mut().find(|e| e.id == ext.id) {
            *slot = ext;
        } else {
            found.push(ext);
        }
    };
    let rows = |doc: Option<Value>, format: &str| -> Vec<Map<String, Value>> {
        match doc {
            Some(Value::Object(d)) if d.get("format").and_then(Value::as_str) == Some(format) => d
                .get("extensions")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(Value::as_object).filter(|r| r.get("id").is_some_and(|v| id_ok(&py_str(Some(v))))).cloned().collect())
                .unwrap_or_default(),
            _ => Vec::new(),
        }
    };
    for row in rows(read_json(&folder.join("enabled.json")), "formportal-enabled-extensions") {
        let source = if row.get("source").and_then(Value::as_str) == Some("sideload") { "sideload" } else { "catalogue" };
        let version = match row.get("version") {
            None => String::new(),
            v => py_str(v),
        };
        let path = match row.get("path") {
            None => String::new(),
            v => py_str(v),
        };
        put(check(Extension::new(&py_str(row.get("id")), &version, source, PathBuf::from(path)), product, app_version, app_name));
    }
    for row in rows(read_json(&folder.join("dev.json")), "formext-dev-extensions") {
        let path = match row.get("path") {
            None => String::new(),
            v => py_str(v),
        };
        put(check(Extension::new(&py_str(row.get("id")), "0.0.0", "development", PathBuf::from(path)), product, app_version, app_name));
    }
    found.sort_by_key(|e| if e.name.is_empty() { e.id.to_lowercase() } else { e.name.to_lowercase() });
    found
}

pub fn stamp(product: &str, root: Option<&Path>) -> (f64, f64) {
    let folder = root.map(Path::to_path_buf).unwrap_or_else(portal_root).join("extensions").join(product);
    let mtime = |name: &str| -> f64 {
        std::fs::metadata(folder.join(name))
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs_f64())
            .unwrap_or(0.0)
    };
    (mtime("enabled.json"), mtime("dev.json"))
}

pub fn csp_for(base: &str) -> String {
    let src = if base.starts_with("http://") || base.starts_with("https://") || base.starts_with("formext://") { base } else { "'self'" };
    format!(
        "default-src 'none'; script-src {src} 'wasm-unsafe-eval'; style-src {src} 'unsafe-inline'; img-src {src} data: blob:; media-src {src} data: blob:; font-src {src}; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"
    )
}

pub fn file_for(extensions: &[Extension], ext_id: &str, version: &str, rel: &str) -> Option<(PathBuf, &'static str)> {
    let ext = extensions.iter().find(|e| e.id == ext_id && e.version == version && e.state == "ready")?;
    if !safe_rel(rel) {
        return None;
    }
    let suffix = Path::new(rel).extension().map(|s| format!(".{}", s.to_string_lossy().to_lowercase()))?;
    let kind = TYPES.iter().find(|(s, _)| *s == suffix).map(|(_, t)| *t)?;
    let root = canonical(&ext.path);
    let candidate = ext.path.join(rel);
    let is_link = |p: &Path| std::fs::symlink_metadata(p).map(|m| m.file_type().is_symlink()).unwrap_or(false);
    if is_link(&candidate) {
        return None;
    }
    for parent in candidate.ancestors().skip(1) {
        if parent.as_os_str().is_empty() {
            continue;
        }
        let resolved = canonical(parent);
        if (inside(&root, &resolved) || resolved == root) && is_link(parent) {
            return None;
        }
    }
    let target = std::fs::canonicalize(&candidate).ok()?;
    if !inside(&root, &target) || !target.is_file() {
        return None;
    }
    Some((target, kind))
}

pub fn headers_for(content_type: &str, base: &str) -> Vec<(&'static str, String)> {
    let mut h = vec![
        ("X-Content-Type-Options", "nosniff".to_string()),
        ("Cache-Control", "no-store".to_string()),
        ("Cross-Origin-Resource-Policy", "cross-origin".to_string()),
        ("Access-Control-Allow-Origin", "*".to_string()),
    ];
    if content_type.starts_with("text/html") {
        h.push(("Content-Security-Policy", csp_for(base)));
    }
    h
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    pub id: String,
    pub extension: String,
    pub command: String,
    #[serde(default)]
    pub args: Value,
}

pub fn mailbox() -> PathBuf {
    crate::prefs::dir().join("extension-requests")
}

fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(tmp, path)
}

pub fn submit(extension: &str, command: &str, args: Value) -> std::io::Result<Request> {
    let folder = mailbox();
    std::fs::create_dir_all(&folder)?;
    let now = std::time::SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let req = Request { id: format!("{now}-{}", std::process::id()), extension: extension.to_string(), command: command.to_string(), args };
    write_atomic(&folder.join(format!("{}.json", req.id)), &serde_json::to_vec(&req)?)?;
    Ok(req)
}

pub fn take() -> Vec<Request> {
    let folder = mailbox();
    let Ok(entries) = std::fs::read_dir(&folder) else { return Vec::new() };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_none_or(|e| e != "json") {
            continue;
        }
        let taken = path.with_extension("taken");
        if std::fs::rename(&path, &taken).is_err() {
            continue;
        }
        if let Some(req) = std::fs::read_to_string(&taken).ok().and_then(|t| serde_json::from_str::<Request>(&t).ok()) {
            out.push(req);
        } else {
            let _ = std::fs::remove_file(&taken);
        }
    }
    out
}

pub fn answer(id: &str, reply: &Value) -> std::io::Result<()> {
    if !id.bytes().all(|c| c.is_ascii_digit() || c == b'-') || id.is_empty() {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "not a request id"));
    }
    let folder = mailbox();
    let _ = std::fs::remove_file(folder.join(format!("{id}.taken")));
    write_atomic(&folder.join(format!("{id}.result")), &serde_json::to_vec(reply)?)
}

pub enum Wait {
    Answered(Value),
    NotTaken,
    TimedOut,
}

pub fn wait(req: &Request, pickup: Duration, limit: Duration) -> Wait {
    let folder = mailbox();
    let (pending, result) = (folder.join(format!("{}.json", req.id)), folder.join(format!("{}.result", req.id)));
    let start = std::time::Instant::now();
    loop {
        if let Some(reply) = read_json(&result) {
            let _ = std::fs::remove_file(&result);
            return Wait::Answered(reply);
        }
        if pending.exists() && start.elapsed() > pickup {
            let _ = std::fs::remove_file(&pending);
            return Wait::NotTaken;
        }
        if start.elapsed() > limit {
            let _ = std::fs::remove_file(folder.join(format!("{}.taken", req.id)));
            return Wait::TimedOut;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}
