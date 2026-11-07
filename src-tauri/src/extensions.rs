use std::sync::Mutex;

use formtray_core::extensions as ext;
use serde_json::{json, Value};
use tauri::http::{Request, Response};
use tauri::menu::{IsMenuItem, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager};

pub const MANAGE_URL: &str = "formai://extensions?product=formtray";

type Cache = ((f64, f64), Vec<ext::Extension>);

#[derive(Default)]
pub struct Exts {
    cache: Mutex<Option<Cache>>,
}

pub fn base() -> &'static str {
    if cfg!(target_os = "windows") {
        "http://formext.localhost"
    } else {
        "formext:/"
    }
}

fn app_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

pub fn current(app: &AppHandle, force: bool) -> (bool, Vec<ext::Extension>) {
    let stamp = ext::stamp(ext::PRODUCT, None);
    let state = app.state::<Exts>();
    let mut guard = state.cache.lock().unwrap();
    if let Some((seen, list)) = guard.as_ref() {
        if !force && *seen == stamp {
            return (false, list.clone());
        }
    }
    let list = ext::resolve(ext::PRODUCT, &app_version(app), ext::APP_NAME, None);
    let changed = guard.as_ref().map(|(_, old)| old.iter().map(|e| e.public(base())).collect::<Vec<_>>() != list.iter().map(|e| e.public(base())).collect::<Vec<_>>()).unwrap_or(true);
    *guard = Some((stamp, list.clone()));
    (changed, list)
}

fn listing(app: &AppHandle, list: &[ext::Extension]) -> Value {
    let (enabled, dev) = ext::stamp(ext::PRODUCT, None);
    json!({
        "product": ext::PRODUCT,
        "app": ext::APP_NAME,
        "appVersion": app_version(app),
        "api": ext::API,
        "stamp": [enabled, dev],
        "extensions": list.iter().map(|e| e.public(base())).collect::<Vec<_>>(),
    })
}

fn decode(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn split(host: Option<&str>, path: &str) -> Option<(String, String, String)> {
    let path = decode(path.trim_start_matches('/'))?;
    match host {
        None | Some("") | Some("localhost") | Some("formext.localhost") => {
            let mut parts = path.splitn(3, '/');
            Some((parts.next()?.to_string(), parts.next()?.to_string(), parts.next()?.to_string()))
        }
        Some(id) => {
            let mut parts = path.splitn(2, '/');
            Some((id.to_string(), parts.next()?.to_string(), parts.next()?.to_string()))
        }
    }
}

pub fn respond(app: &AppHandle, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let method = request.method().as_str();
    let found = (method == "GET" || method == "HEAD")
        .then(|| split(request.uri().host(), request.uri().path()))
        .flatten()
        .and_then(|(id, version, rel)| {
            let (_, list) = current(app, false);
            let (path, kind) = ext::file_for(&list, &id, &version, &rel)?;
            let bytes = std::fs::read(path).ok()?;
            Some((bytes, kind, format!("{}/{id}/{version}/", base())))
        });
    let mut builder = Response::builder();
    match found {
        Some((bytes, kind, csp_base)) => {
            builder = builder.header("Content-Type", kind);
            for (k, v) in ext::headers_for(kind, &csp_base) {
                builder = builder.header(k, v);
            }
            builder.body(if method == "HEAD" { Vec::new() } else { bytes })
        }
        None => {
            for (k, v) in ext::headers_for("", "") {
                builder = builder.header(k, v);
            }
            builder.status(404).body(Vec::new())
        }
    }
    .unwrap_or_default()
}

pub fn open_url(url: &str) -> std::io::Result<()> {
    let mut cmd = if cfg!(target_os = "macos") {
        std::process::Command::new("open")
    } else if cfg!(target_os = "windows") {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", ""]);
        c
    } else {
        std::process::Command::new("xdg-open")
    };
    cmd.arg(url).spawn().map(|_| ())
}

pub fn submenu(app: &AppHandle) -> tauri::Result<Submenu<tauri::Wry>> {
    let (_, list) = current(app, false);
    let mut commands: Vec<MenuItem<tauri::Wry>> = Vec::new();
    for e in list.iter().filter(|e| e.state == "ready") {
        let name = if e.name.is_empty() { &e.id } else { &e.name };
        for c in &e.commands {
            let (Some(id), Some(title)) = (c["id"].as_str(), c["title"].as_str()) else { continue };
            commands.push(MenuItem::with_id(app, format!("ext-cmd:{}:{id}", e.id), format!("{name}: {title}"), true, None::<&str>)?);
        }
    }
    let sep = PredefinedMenuItem::separator(app)?;
    let panel = MenuItem::with_id(app, "ext-panel", "Extensions Panel", true, None::<&str>)?;
    let reload = MenuItem::with_id(app, "ext-reload", "Reload Extensions", true, None::<&str>)?;
    let manage = MenuItem::with_id(app, "ext-manage", "Manage in FormPortal", true, None::<&str>)?;
    let mut refs: Vec<&dyn IsMenuItem<tauri::Wry>> = commands.iter().map(|i| i as &dyn IsMenuItem<tauri::Wry>).collect();
    if !refs.is_empty() {
        refs.push(&sep);
    }
    refs.extend([&panel as &dyn IsMenuItem<tauri::Wry>, &reload, &manage]);
    Submenu::with_id_and_items(app, "ext-menu", "Extensions", true, &refs)
}

pub fn on_menu(app: &AppHandle, id: &str) -> bool {
    match id {
        "ext-panel" => {
            let view = crate::with_engine(app, |e| e.last_view());
            crate::show_view(app, &view, "switch");
            let _ = app.emit_to(crate::PANEL, "ext:sheet", ());
        }
        "ext-reload" => reload(app),
        "ext-manage" => {
            if open_url(MANAGE_URL).is_err() {
                let _ = app.emit("notice", "FormPortal could not be opened. Install FormPortal to manage extensions.");
            }
        }
        other => {
            let Some(rest) = other.strip_prefix("ext-cmd:") else { return false };
            let Some((ext_id, command)) = rest.split_once(':') else { return true };
            let view = crate::with_engine(app, |e| e.last_view());
            crate::show_view(app, &view, "switch");
            let _ = app.emit_to(crate::PANEL, "ext:run", json!({ "id": ext_id, "command": command, "args": {} }));
        }
    }
    true
}

pub fn reload(app: &AppHandle) {
    let (_, list) = current(app, true);
    crate::refresh_tray(app);
    let _ = app.emit("ext:changed", listing(app, &list));
}

pub fn poll(app: &AppHandle) {
    let (changed, list) = current(app, false);
    if changed {
        let inner = app.clone();
        let _ = app.run_on_main_thread(move || crate::refresh_tray(&inner));
        let _ = app.emit("ext:changed", listing(app, &list));
    }
    for req in ext::take() {
        let _ = app.emit_to(crate::PANEL, "ext:request", &req);
    }
}

#[tauri::command]
pub fn extensions(app: AppHandle) -> Value {
    let (_, list) = current(&app, false);
    listing(&app, &list)
}

#[tauri::command]
pub fn extensions_stamp() -> (f64, f64) {
    ext::stamp(ext::PRODUCT, None)
}

#[tauri::command]
pub fn extensions_reload(app: AppHandle) -> Value {
    reload(&app);
    let (_, list) = current(&app, false);
    listing(&app, &list)
}

#[tauri::command]
pub fn extension_answer(id: String, reply: Value) -> Result<(), String> {
    ext::answer(&id, &reply).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn extensions_manage() -> Result<(), String> {
    open_url(MANAGE_URL).map_err(|_| "FormPortal could not be opened. Install FormPortal to manage extensions.".to_string())
}
