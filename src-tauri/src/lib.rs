mod glass;
mod keys;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use formai_core::{Engine, Prefs, Snapshot, VIEWS};
use serde::Serialize;
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, RunEvent, WebviewWindow, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const PANELS: [&str; 5] = VIEWS;
const BACKGROUND_FLAG: &str = "--background";

#[derive(Clone, Serialize)]
struct HotkeyIssue {
    action: String,
    chord: String,
    reason: String,
}

#[derive(Default)]
struct Shell {
    engine: Mutex<Option<Engine>>,
    shown: Mutex<Option<String>>,
    chords: Mutex<HashMap<u32, String>>,
    issues: Mutex<Vec<HotkeyIssue>>,
    glass: Mutex<String>,
    watching: AtomicBool,
    shown_at: Mutex<Option<std::time::Instant>>,
}

fn with_engine<T>(app: &AppHandle, f: impl FnOnce(&mut Engine) -> T) -> T {
    let shell = app.state::<Shell>();
    let mut guard = shell.engine.lock().unwrap();
    let engine = guard.get_or_insert_with(Engine::new);
    f(engine)
}

fn broadcast(app: &AppHandle) {
    let snapshot = with_engine(app, |e| e.snapshot());
    let _ = app.emit("state", snapshot);
}

fn panel(app: &AppHandle, label: &str) -> Option<WebviewWindow> {
    app.get_webview_window(label)
}

fn hide_panels(app: &AppHandle) {
    for label in PANELS {
        if let Some(w) = panel(app, label) {
            let _ = w.hide();
        }
    }
    *app.state::<Shell>().shown.lock().unwrap() = None;
}

fn place(app: &AppHandle, window: &WebviewWindow, view: &str, logical: (f64, f64)) {
    let cursor = app.cursor_position().ok();
    let monitor = cursor
        .and_then(|c| app.monitor_from_point(c.x, c.y).ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        let _ = window.center();
        return;
    };
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let (w, h) = ((logical.0 * scale) as i32, (logical.1 * scale) as i32);
    let (ax, ay, aw, ah) = (area.position.x, area.position.y, area.size.width as i32, area.size.height as i32);
    let gap = (10.0 * scale) as i32;
    let (x, y) = if view == "stack" {
        let cx = cursor.map(|c| c.x as i32).unwrap_or(ax + aw / 2);
        ((cx - w / 2).clamp(ax + gap, ax + aw - w - gap), ay + ah - h - gap)
    } else {
        (ax + (aw - w) / 2, ay + (ah - h) / 2 - ah / 12)
    };
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

fn panel_size(app: &AppHandle, view: &str) -> (f64, f64) {
    match view {
        "switcher" => {
            let count = with_engine(app, |e| {
                let s = e.snapshot();
                let installed = s.apps.iter().filter(|a| a.installed && !a.hidden).count();
                if installed == 0 { s.apps.iter().filter(|a| !a.hidden).count() } else { installed }
            });
            (count.clamp(1, 9) as f64 * 112.0 + 48.0, 196.0)
        }
        "stack" => (420.0, 452.0),
        "windows" => (940.0, 560.0),
        "widgets" => (920.0, 640.0),
        _ => (880.0, 660.0),
    }
}

fn show_view(app: &AppHandle, view: &str, reason: &str) {
    if !PANELS.contains(&view) {
        return;
    }
    let Some(window) = panel(app, view) else { return };
    let shell = app.state::<Shell>();
    if shell.shown.lock().unwrap().as_deref() == Some(view) && window.is_visible().unwrap_or(false) && reason != "switcher" {
        hide_panels(app);
        return;
    }
    for label in PANELS.iter().filter(|l| **l != view) {
        if let Some(w) = panel(app, label) {
            let _ = w.hide();
        }
    }
    with_engine(app, |e| {
        e.refresh_running();
        e.note_view(view);
    });
    broadcast(app);
    let logical = panel_size(app, view);
    let _ = window.set_resizable(true);
    let _ = window.set_size(LogicalSize::new(logical.0, logical.1));
    let _ = window.set_resizable(false);
    place(app, &window, view, logical);
    let _ = app.emit_to(view, "view:shown", reason);
    let _ = window.show();
    let _ = window.set_focus();
    *shell.shown.lock().unwrap() = Some(view.to_string());
    *shell.shown_at.lock().unwrap() = Some(std::time::Instant::now());
    if view == "switcher" {
        watch_switcher(app);
    }
}

fn watch_switcher(app: &AppHandle) {
    let chord = with_engine(app, |e| e.snapshot().hotkeys.get("switcher").cloned().unwrap_or_default());
    let mods = keys::modifiers(&chord);
    if keys::held(&mods).is_none() {
        return;
    }
    let shell = app.state::<Shell>();
    if shell.watching.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_millis(25));
            let visible = panel(&app, "switcher").and_then(|w| w.is_visible().ok()).unwrap_or(false);
            if !visible {
                break;
            }
            if keys::held(&mods) == Some(false) {
                let _ = app.emit_to("switcher", "switcher:commit", ());
                break;
            }
        }
        app.state::<Shell>().watching.store(false, Ordering::SeqCst);
    });
}

fn register_hotkeys(app: &AppHandle) {
    let shortcuts = app.global_shortcut();
    let _ = shortcuts.unregister_all();
    let wanted = with_engine(app, |e| e.snapshot().hotkeys);
    let mut chords = HashMap::new();
    let mut issues = Vec::new();
    let mut pairs: Vec<(String, String)> = wanted.into_iter().collect();
    if let Some(chord) = pairs.iter().find(|(a, _)| a == "switcher").map(|(_, c)| c.clone()) {
        if !chord.to_ascii_lowercase().contains("shift") {
            pairs.push(("switcher-back".into(), format!("Shift+{chord}")));
        }
    }
    for (action, chord) in pairs {
        match chord.parse::<Shortcut>() {
            Ok(shortcut) => match shortcuts.register(shortcut) {
                Ok(()) => {
                    chords.insert(shortcut.id(), action);
                }
                Err(e) => issues.push(HotkeyIssue { action, chord, reason: e.to_string() }),
            },
            Err(e) => issues.push(HotkeyIssue { action, chord, reason: e.to_string() }),
        }
    }
    let shell = app.state::<Shell>();
    *shell.chords.lock().unwrap() = chords;
    *shell.issues.lock().unwrap() = issues;
}

fn on_hotkey(app: &AppHandle, shortcut: &Shortcut) {
    let action = app.state::<Shell>().chords.lock().unwrap().get(&shortcut.id()).cloned();
    let Some(action) = action else { return };
    let shown = app.state::<Shell>().shown.lock().unwrap().clone();
    match action.as_str() {
        "switcher" | "switcher-back" => {
            let step: i32 = if action == "switcher" { 1 } else { -1 };
            if shown.as_deref() == Some("switcher") {
                let _ = app.emit_to("switcher", "switcher:step", step);
            } else {
                show_view(app, "switcher", "switcher");
            }
        }
        "summon" => {
            if shown.is_some() {
                hide_panels(app);
            } else {
                let view = with_engine(app, |e| e.last_view());
                show_view(app, &view, "hotkey");
            }
        }
        other => {
            if let Some(view) = other.strip_prefix("view-") {
                show_view(app, view, "hotkey");
            }
        }
    }
}

fn open_prefs(app: &AppHandle) {
    hide_panels(app);
    if let Some(w) = panel(app, "prefs") {
        broadcast(app);
        let _ = app.emit_to("prefs", "view:shown", "menu");
        let _ = w.center();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn check_updates(app: &AppHandle) -> Result<(), String> {
    hide_panels(app);
    with_engine(app, |e| e.open("formportal")).map(|_| ()).map_err(|e| format!("{e}. Install FormPortal to check for updates."))
}

fn sync_login(app: &AppHandle, on: bool) {
    let launcher = app.autolaunch();
    let now = launcher.is_enabled().unwrap_or(false);
    if on && !now {
        let _ = launcher.enable();
    } else if !on && now {
        let _ = launcher.disable();
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let login_on = with_engine(app, |e| e.prefs.open_at_login);
    let items: Vec<MenuItem<tauri::Wry>> = [("view-switcher", "Switcher"), ("view-stack", "Stack"), ("view-apps", "Apps"), ("view-windows", "Windows"), ("view-widgets", "Widgets")]
        .iter()
        .map(|(id, label)| MenuItem::with_id(app, *id, *label, true, None::<&str>))
        .collect::<tauri::Result<_>>()?;
    let updates = MenuItem::with_id(app, "updates", "Check for Updates...", true, None::<&str>)?;
    let prefs = MenuItem::with_id(app, "prefs", "Settings...", true, Some("CmdOrCtrl+,"))?;
    let login = CheckMenuItem::with_id(app, "login", "Open at Login", true, login_on, None::<&str>)?;
    let rescan = MenuItem::with_id(app, "rescan", "Find Apps Again", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit FormAI", true, Some("CmdOrCtrl+Q"))?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let mut refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<tauri::Wry>).collect();
    refs.extend([&sep1 as &dyn tauri::menu::IsMenuItem<tauri::Wry>, &updates, &rescan, &prefs, &login, &sep2, &quit]);
    let menu = Menu::with_items(app, &refs)?;
    let login_item = login.clone();
    TrayIconBuilder::with_id("formai")
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .icon_as_template(true)
        .tooltip("FormAI")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "updates" => {
                if let Err(e) = check_updates(app) {
                    let _ = app.emit("notice", e);
                }
            }
            "prefs" => open_prefs(app),
            "rescan" => {
                with_engine(app, |e| e.rediscover());
                broadcast(app);
            }
            "login" => {
                let on = login_item.is_checked().unwrap_or(false);
                let prefs = with_engine(app, |e| {
                    let mut p = e.prefs.clone();
                    p.open_at_login = on;
                    let _ = e.set_prefs(p.clone());
                    p
                });
                sync_login(app, prefs.open_at_login);
                broadcast(app);
            }
            "quit" => app.exit(0),
            other => {
                if let Some(view) = other.strip_prefix("view-") {
                    show_view(app, view, "menu");
                }
            }
        })
        .build(app)?;
    Ok(())
}

fn handle_args(app: &AppHandle, args: &[String], first: bool) {
    if let Some(i) = args.iter().position(|a| a == "--view") {
        if let Some(view) = args.get(i + 1) {
            show_view(app, view, "command");
            return;
        }
    }
    if args.iter().any(|a| a == "--prefs") {
        open_prefs(app);
        return;
    }
    if first && args.iter().any(|a| a == BACKGROUND_FLAG) {
        return;
    }
    let view = if first { with_engine(app, |e| e.prefs.default_view.clone()) } else { "stack".to_string() };
    show_view(app, &view, if first { "launch" } else { "dock" });
}

#[tauri::command]
fn snapshot(app: AppHandle) -> Snapshot {
    with_engine(&app, |e| e.snapshot())
}

#[tauri::command]
fn open_app(app: AppHandle, id: String) -> Result<(), String> {
    let result = with_engine(&app, |e| e.open(&id)).map(|_| ()).map_err(|e| e.to_string());
    if result.is_ok() {
        hide_panels(&app);
    }
    broadcast(&app);
    result
}

#[tauri::command]
fn quit_app(app: AppHandle, id: String) -> Result<(), String> {
    let result = with_engine(&app, |e| e.quit(&id)).map_err(|e| e.to_string());
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(700));
        with_engine(&handle, |e| e.refresh_running());
        broadcast(&handle);
    });
    result
}

#[tauri::command]
fn set_prefs(app: AppHandle, prefs: Prefs) -> Result<Snapshot, String> {
    let login = prefs.open_at_login;
    with_engine(&app, |e| e.set_prefs(prefs)).map_err(|e| e.to_string())?;
    sync_login(&app, login);
    register_hotkeys(&app);
    broadcast(&app);
    Ok(with_engine(&app, |e| e.snapshot()))
}

#[tauri::command]
fn show(app: AppHandle, view: String) {
    if view == "prefs" {
        open_prefs(&app);
    } else {
        show_view(&app, &view, "switch");
    }
}

#[tauri::command]
fn dismiss(app: AppHandle, window: WebviewWindow) {
    if window.label() == "prefs" {
        let _ = window.hide();
    } else {
        hide_panels(&app);
    }
}

#[tauri::command]
fn shell_info(app: AppHandle) -> serde_json::Value {
    let shell = app.state::<Shell>();
    let glass = shell.glass.lock().unwrap().clone();
    let issues = shell.issues.lock().unwrap().clone();
    let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some();
    serde_json::json!({ "glass": glass, "issues": issues, "wayland": wayland, "version": app.package_info().version.to_string() })
}

#[tauri::command]
fn updates(app: AppHandle) -> Result<(), String> {
    check_updates(&app)
}

#[tauri::command]
fn set_hotkey(app: AppHandle, action: String, chord: String) -> Result<Snapshot, String> {
    let result = with_engine(&app, |e| e.set_hotkey(&action, &chord));
    register_hotkeys(&app);
    broadcast(&app);
    result.map(|_| with_engine(&app, |e| e.snapshot()))
}

#[tauri::command]
fn pause_hotkeys(app: AppHandle, paused: bool) {
    if paused {
        let _ = app.global_shortcut().unregister_all();
    } else {
        register_hotkeys(&app);
    }
}

#[tauri::command]
fn rescan(app: AppHandle) {
    with_engine(&app, |e| e.rediscover());
    broadcast(&app);
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            handle_args(app, &argv, false);
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![BACKGROUND_FLAG])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        on_hotkey(app, shortcut);
                    }
                })
                .build(),
        )
        .manage(Shell::default())
        .invoke_handler(tauri::generate_handler![snapshot, open_app, quit_app, set_prefs, show, dismiss, shell_info, updates, rescan, set_hotkey, pause_hotkeys])
        .on_window_event(|window, event| match event {
            WindowEvent::Focused(false) if PANELS.contains(&window.label()) => {
                let app = window.app_handle();
                let shown = app.state::<Shell>().shown.lock().unwrap().clone();
                let settling = app.state::<Shell>().shown_at.lock().unwrap().is_some_and(|t| t.elapsed() < Duration::from_millis(300));
                if shown.as_deref() == Some(window.label()) && !settling {
                    hide_panels(app);
                }
            }
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            _ => {}
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let mut mode = "css";
            for label in PANELS.iter().chain(["prefs"].iter()) {
                if let Some(w) = panel(&handle, label) {
                    mode = glass::apply(&w);
                }
            }
            *handle.state::<Shell>().glass.lock().unwrap() = mode.to_string();
            with_engine(&handle, |_| ());
            register_hotkeys(&handle);
            build_tray(&handle)?;
            let poller = handle.clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(1000));
                let visible = poller.state::<Shell>().shown.lock().unwrap().is_some() || panel(&poller, "prefs").and_then(|w| w.is_visible().ok()).unwrap_or(false);
                if visible && with_engine(&poller, |e| e.refresh_running()) {
                    broadcast(&poller);
                }
            });
            let args: Vec<String> = std::env::args().collect();
            let starter = handle.clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(350));
                let inner = starter.clone();
                let _ = starter.run_on_main_thread(move || handle_args(&inner, &args, true));
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("FormAI failed to start");

    app.run(|_app, event| match event {
        RunEvent::ExitRequested { api, code, .. } if code.is_none() => api.prevent_exit(),
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => show_view(_app, "stack", "dock"),
        _ => {}
    });
}
