#![cfg(all(unix, not(target_os = "macos")))]

use std::os::unix::fs::PermissionsExt;
use std::os::unix::process::ExitStatusExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use formtray_core::registry::opens_unix;
use formtray_core::running::Watcher;
use formtray_core::{launch, prefs, Engine, LaunchError, Prefs, Registry, Usage};

static ENV: Mutex<()> = Mutex::new(());

struct Config {
    _lock: MutexGuard<'static, ()>,
    root: PathBuf,
}

impl Config {
    fn new(tag: &str) -> Config {
        let lock = ENV.lock().unwrap_or_else(|e| e.into_inner());
        static N: AtomicUsize = AtomicUsize::new(0);
        let root = std::env::temp_dir().join(format!("formtray-rl-{}-{tag}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = std::fs::remove_dir_all(&root);
        for dir in ["portal", "bin", "data"] {
            std::fs::create_dir_all(root.join(dir)).unwrap();
        }
        std::env::set_var("HOME", &root);
        std::env::set_var("XDG_CONFIG_HOME", &root);
        std::env::set_var("XDG_DATA_HOME", root.join("data"));
        std::env::set_var("XDG_DATA_DIRS", root.join("data"));
        std::env::set_var("FORMPORTAL_ROOT", root.join("portal"));
        Config { _lock: lock, root }
    }

    fn path(&self, rel: &str) -> PathBuf {
        self.root.join(rel)
    }

    fn program(&self, rel: &str, body: &str) -> PathBuf {
        let p = self.path(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
        p
    }

    fn portal(&self, installs: &str, released: &[&str]) {
        let products: Vec<String> = released.iter().map(|id| format!(r#"{{"id":"{id}","name":"{id}","channels":{{"stable":{{"version":"9.0.0","artifacts":[{{"platform":"linux"}}]}}}}}}"#)).collect();
        std::fs::write(self.path("portal/installed.json"), format!(r#"{{"installs":[{installs}]}}"#)).unwrap();
        std::fs::create_dir_all(self.path("portal/catalog")).unwrap();
        std::fs::write(self.path("portal/catalog/apps.json"), format!(r#"{{"products":[{}]}}"#, products.join(","))).unwrap();
    }

    fn read(&self, name: &str) -> serde_json::Value {
        serde_json::from_str(&std::fs::read_to_string(prefs::dir().join(name)).unwrap()).unwrap()
    }
}

impl Drop for Config {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn app(id: &str) -> formtray_core::AppEntry {
    Registry::load().get(id).unwrap().clone()
}

fn wait_for(path: &Path) -> String {
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(5) {
        if let Ok(text) = std::fs::read_to_string(path) {
            if !text.is_empty() {
                return text;
            }
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    panic!("{} never appeared", path.display());
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
}

#[test]
fn release_timestamps_convert_to_the_unix_seconds_a_calendar_gives() {
    assert_eq!(opens_unix("1970-01-01T00:00:00Z"), Some(0));
    assert_eq!(opens_unix("2000-03-01T00:00:00Z"), Some(951868800));
    assert_eq!(opens_unix("2024-02-29T12:30:45Z"), Some(1709209845));
    assert_eq!(opens_unix("2026-11-03T17:00:00Z"), Some(1793725200));
    assert_eq!(opens_unix("2100-03-01T00:00:00Z"), Some(4107542400));
}

#[test]
fn release_timestamps_one_day_apart_differ_by_86400_seconds_across_a_leap_day() {
    let a = opens_unix("2024-02-28T10:00:00Z").unwrap();
    let b = opens_unix("2024-02-29T10:00:00Z").unwrap();
    let c = opens_unix("2024-03-01T10:00:00Z").unwrap();
    assert_eq!((b - a, c - b), (86400, 86400));
    let y = opens_unix("2023-02-28T10:00:00Z").unwrap();
    let z = opens_unix("2023-03-01T10:00:00Z").unwrap();
    assert_eq!(z - y, 86400);
}

#[test]
fn badly_formed_release_timestamps_give_nothing() {
    for bad in [
        "", "2026-11-03", "2026-11-03T17:00:00", "2026-11-03 17:00:00Z", "2026-13-01T00:00:00Z", "2026-00-10T00:00:00Z", "2026-11-32T00:00:00Z",
        "2026-11-03T24:00:00Z", "2026-11-03T17:60:00Z", "2026-11-03T17:00:60Z", "2026-1a-03T17:00:00Z", "+026-11-03T17:00:00Z", "1969-12-31T23:59:59Z",
        "2026-11-03T17:00:00z", "2026-11-03T17:00:00+00:00",
    ] {
        assert_eq!(opens_unix(bad), None, "{bad:?}");
    }
}

#[test]
fn an_app_is_released_from_the_second_its_opening_time_arrives() {
    let mut a = app("formvis");
    a.opens = "2026-11-03T17:00:00Z".to_string();
    let at = 1793725200;
    assert!(!a.released_at(at - 1));
    assert!(a.released_at(at));
    assert!(a.released_at(at + 1));
}

#[test]
fn an_app_without_a_valid_opening_time_is_never_released() {
    let mut a = app("formvis");
    a.opens = String::new();
    assert!(!a.released_at(u64::MAX));
    a.opens = "soon".to_string();
    assert!(!a.released_at(u64::MAX));
}

#[test]
fn every_registry_app_has_a_valid_opening_time() {
    for a in Registry::load().apps {
        assert!(opens_unix(&a.opens).is_some(), "{} has opens {:?}", a.id, a.opens);
    }
}

#[test]
fn every_app_is_found_again_by_its_name_in_any_case() {
    let registry = Registry::load();
    for a in &registry.apps {
        assert_eq!(registry.get(&a.name).map(|f| &f.id), Some(&a.id));
        assert_eq!(registry.get(&a.name.to_ascii_uppercase()).map(|f| &f.id), Some(&a.id));
        for n in &a.names {
            assert_eq!(registry.get(n).map(|f| &f.id), Some(&a.id), "{n}");
            assert!(a.matches_name(&n.to_ascii_lowercase()));
        }
    }
}

#[test]
fn an_unknown_or_excluded_name_finds_no_app() {
    let registry = Registry::load();
    assert!(registry.get("nonesuch").is_none());
    assert!(registry.get("").is_none());
    for id in &registry.excluded {
        assert!(registry.get(id).is_none(), "{id}");
    }
}

#[test]
fn the_registry_is_the_same_each_time_it_is_loaded() {
    let a = serde_json::to_string(&Registry::load()).unwrap();
    let b = serde_json::to_string(&Registry::load()).unwrap();
    assert_eq!(a, b);
}

#[test]
fn old_app_ids_in_saved_settings_are_renamed_and_repeats_are_dropped() {
    let c = Config::new("legacy");
    std::fs::create_dir_all(prefs::dir()).unwrap();
    std::fs::write(
        prefs::dir().join("prefs.json"),
        r#"{"default_view":"apps","hidden":["formslide","formslide","formranker"],"pinned":["formranker","formcut","formslide","formdeck"],"widgets":[{"app":"formslide","id":"formslide"},{"kind":"group","apps":["formranker","formcut"]}]}"#,
    )
    .unwrap();
    let p = Prefs::load();
    assert_eq!(p.hidden, vec!["formdeck", "formbench"]);
    assert_eq!(p.pinned, vec!["formbench", "formcut", "formdeck"]);
    assert_eq!(p.widgets[0].app, "formdeck");
    assert_eq!(p.widgets[1].apps, vec!["formbench", "formcut"]);
    assert_eq!(p.default_view, "widgets");
    assert_eq!(p.layout, 2);
    assert_eq!(c.read("prefs.json")["layout"], 2);
}

#[test]
fn settings_already_at_the_current_layout_are_left_as_they_were() {
    let _c = Config::new("current");
    std::fs::create_dir_all(prefs::dir()).unwrap();
    std::fs::write(prefs::dir().join("prefs.json"), r#"{"layout":2,"default_view":"apps","hidden":["formslide","formslide"]}"#).unwrap();
    let p = Prefs::load();
    assert_eq!(p.default_view, "apps");
    assert_eq!(p.hidden, vec!["formslide", "formslide"]);
}

#[test]
fn a_tile_saved_without_fields_comes_back_as_a_medium_app_tile() {
    let _c = Config::new("tile");
    std::fs::create_dir_all(prefs::dir()).unwrap();
    std::fs::write(prefs::dir().join("prefs.json"), r#"{"layout":2,"widgets":[{"app":"formcut"}]}"#).unwrap();
    let tile = &Prefs::load().widgets[0];
    assert_eq!((tile.kind.as_str(), tile.size.as_str(), tile.app.as_str()), ("app", "m", "formcut"));
}

#[test]
fn old_ids_in_usage_are_merged_into_the_new_id_adding_counts_and_keeping_the_latest_time() {
    let _c = Config::new("usage");
    std::fs::create_dir_all(prefs::dir()).unwrap();
    std::fs::write(
        prefs::dir().join("usage.json"),
        r#"{"apps":{"formslide":{"count":3,"last":500},"formdeck":{"count":2,"last":900},"formranker":{"count":4,"last":7}},"last_view":"stack"}"#,
    )
    .unwrap();
    let u = Usage::load();
    assert_eq!((u.apps["formdeck"].count, u.apps["formdeck"].last), (5, 900));
    assert_eq!((u.apps["formbench"].count, u.apps["formbench"].last), (4, 7));
    assert!(!u.apps.contains_key("formslide") && !u.apps.contains_key("formranker"));
    assert_eq!(u.last_view, "stack");
}

#[test]
fn touching_an_app_counts_one_more_use_and_stamps_the_time() {
    let mut u = Usage::default();
    let before = now();
    u.touch("formcut");
    u.touch("formcut");
    u.touch("formwav");
    assert_eq!(u.apps["formcut"].count, 2);
    assert_eq!(u.apps["formwav"].count, 1);
    assert!(u.apps["formcut"].last >= before && u.apps["formcut"].last <= now());
}

#[test]
fn a_released_app_in_the_portal_catalogue_is_listed_and_named_from_the_portal() {
    let c = Config::new("snapshot");
    c.portal("", &["formrec"]);
    let snap = Engine::new().snapshot();
    assert!(snap.portal);
    let rec = snap.apps.iter().find(|a| a.id == "formrec").expect("formrec listed");
    assert_eq!(rec.name, "FormREC");
    assert_eq!(rec.name_source, "portal");
    assert!(!rec.installed && !rec.running && rec.path.is_none());
}

#[test]
fn the_listed_apps_are_the_registry_apps_already_open_in_registry_order_and_never_formtray() {
    let c = Config::new("order");
    c.portal("", &[]);
    let snap = Engine::new().snapshot();
    let t = now();
    let want: Vec<String> = Registry::load().apps.iter().filter(|a| opens_unix(&a.opens).is_some_and(|o| o <= t)).map(|a| a.id.clone()).collect();
    let got: Vec<String> = snap.apps.iter().map(|a| a.id.clone()).collect();
    assert_eq!(got, want);
    assert!(!got.iter().any(|id| id == "formtray"));
}

#[test]
fn an_app_installed_by_the_portal_is_found_at_its_folder_and_shown_as_installed() {
    let c = Config::new("managed");
    let program = c.program("portal/apps/formrec/formrec", "exit 0");
    let folder = c.path("portal/apps/formrec");
    c.portal(&format!(r#"{{"product":"formrec","channel":"stable","current":{{"version":"1.0.0","path":"{}"}}}}"#, folder.display()), &["formrec"]);
    let snap = Engine::new().snapshot();
    let rec = snap.apps.iter().find(|a| a.id == "formrec").unwrap();
    assert!(rec.installed);
    assert_eq!(rec.path.as_deref(), Some(program.as_path()));
}

#[test]
fn a_newer_catalogue_version_shows_as_an_update_in_the_snapshot() {
    let c = Config::new("updates");
    let folder = c.path("portal/apps/formrec");
    c.program("portal/apps/formrec/formrec", "exit 0");
    c.portal(&format!(r#"{{"product":"formrec","channel":"stable","current":{{"version":"1.0.0","path":"{}"}}}}"#, folder.display()), &["formrec"]);
    let updates = Engine::new().snapshot().updates;
    assert_eq!(updates.len(), 1);
    assert_eq!((updates[0].id.as_str(), updates[0].from.as_str(), updates[0].to.as_str()), ("formrec", "1.0.0", "9.0.0"));
}

#[test]
fn adding_a_search_location_in_settings_finds_an_app_there_at_once() {
    let c = Config::new("locations");
    c.portal("", &["formwav"]);
    let program = c.program("elsewhere/formwav", "exit 0");
    let mut engine = Engine::new();
    assert!(engine.snapshot().apps.iter().find(|a| a.id == "formwav").unwrap().path.is_none());
    let mut next = engine.prefs.clone();
    next.locations = vec![c.path("elsewhere")];
    engine.set_prefs(next).unwrap();
    let wav = engine.snapshot().apps.iter().find(|a| a.id == "formwav").cloned().unwrap();
    assert_eq!(wav.path.as_deref(), Some(program.as_path()));
    assert!(wav.installed);
    assert_eq!(c.read("prefs.json")["locations"][0], c.path("elsewhere").to_string_lossy().as_ref());
}

#[test]
fn hiding_an_app_in_settings_marks_it_hidden_in_the_snapshot_and_persists() {
    let c = Config::new("hidden");
    c.portal("", &["formwav"]);
    let mut engine = Engine::new();
    let mut next = engine.prefs.clone();
    next.hidden = vec!["formwav".into()];
    engine.set_prefs(next).unwrap();
    assert!(engine.snapshot().apps.iter().find(|a| a.id == "formwav").unwrap().hidden);
    assert_eq!(c.read("prefs.json")["hidden"][0], "formwav");
}

#[test]
fn opening_an_installed_app_counts_a_use_and_saves_it() {
    let c = Config::new("open");
    c.portal("", &["formwav"]);
    c.program("bin/formwav", "exit 0");
    let mut engine = Engine::new();
    let mut next = engine.prefs.clone();
    next.locations = vec![c.path("bin")];
    engine.set_prefs(next).unwrap();
    let before = now();
    assert_eq!(engine.open("FormWav").unwrap(), "formwav");
    let wav = engine.snapshot().apps.into_iter().find(|a| a.id == "formwav").unwrap();
    assert_eq!(wav.count, 1);
    assert!(wav.last >= before);
    assert_eq!(c.read("usage.json")["apps"]["formwav"]["count"], 1);
}

#[test]
fn opening_an_app_that_is_not_installed_says_so_and_counts_nothing() {
    let c = Config::new("opennot");
    c.portal("", &["formwav"]);
    let mut engine = Engine::new();
    let error = engine.open("formwav").unwrap_err();
    assert_eq!(error.to_string(), "FormWav is not installed on this computer");
    assert!(!prefs::dir().join("usage.json").exists());
}

#[test]
fn opening_or_quitting_a_name_that_is_not_a_form_app_is_refused() {
    let c = Config::new("openunknown");
    c.portal("", &[]);
    let mut engine = Engine::new();
    assert_eq!(engine.open("notepad").unwrap_err().to_string(), "notepad is not installed on this computer");
    assert_eq!(engine.quit("notepad").unwrap_err().to_string(), "notepad is not installed on this computer");
    assert_eq!(engine.open("formtray").unwrap_err().to_string(), "formtray is not installed on this computer");
}

#[test]
fn quitting_an_app_that_is_not_running_says_so() {
    let c = Config::new("quitnot");
    c.portal("", &["formwav"]);
    let mut engine = Engine::new();
    if engine.snapshot().apps.iter().any(|a| a.id == "formwav" && a.running) {
        return;
    }
    assert_eq!(engine.quit("formwav").unwrap_err().to_string(), "FormWav is not running");
}

#[test]
fn the_view_last_used_is_remembered_and_an_unknown_view_is_ignored() {
    let c = Config::new("views");
    c.portal("", &[]);
    let mut engine = Engine::new();
    assert_eq!(engine.last_view(), engine.prefs.default_view);
    engine.note_view("stack");
    assert_eq!(engine.last_view(), "stack");
    assert_eq!(c.read("usage.json")["last_view"], "stack");
    engine.note_view("nowhere");
    assert_eq!(engine.last_view(), "stack");
    assert_eq!(Engine::new().snapshot().last_view, "stack");
}

#[test]
fn a_settings_file_changed_by_another_program_is_picked_up_once() {
    let c = Config::new("reload");
    c.portal("", &[]);
    let mut engine = Engine::new();
    assert!(!engine.reload_changed());
    std::fs::create_dir_all(prefs::dir()).unwrap();
    std::fs::write(prefs::dir().join("prefs.json"), r#"{"layout":2,"default_view":"windows","pinned":["formcut"]}"#).unwrap();
    std::fs::write(prefs::dir().join("usage.json"), r#"{"apps":{"formcut":{"count":7,"last":1}},"last_view":"stack"}"#).unwrap();
    assert!(engine.reload_changed());
    assert_eq!(engine.prefs.default_view, "windows");
    assert_eq!(engine.prefs.pinned, vec!["formcut"]);
    assert_eq!(engine.usage.apps["formcut"].count, 7);
    assert_eq!(engine.last_view(), "stack");
    assert!(!engine.reload_changed());
}

#[test]
fn a_view_in_usage_that_is_not_a_view_falls_back_to_the_default_view() {
    let c = Config::new("fallback");
    c.portal("", &[]);
    std::fs::create_dir_all(prefs::dir()).unwrap();
    std::fs::write(prefs::dir().join("usage.json"), r#"{"last_view":"bogus"}"#).unwrap();
    std::fs::write(prefs::dir().join("prefs.json"), r#"{"layout":2,"default_view":"windows"}"#).unwrap();
    assert_eq!(Engine::new().last_view(), "windows");
}

#[test]
fn the_cli_style_not_installed_message_names_the_app() {
    assert_eq!(LaunchError::NotFound("FormCut".into()).to_string(), "FormCut is not installed on this computer");
    assert_eq!(LaunchError::Failed("it broke".into()).to_string(), "it broke");
}

#[test]
fn opening_without_a_program_and_not_running_is_not_installed() {
    let mut guard = |_: &Path| -> Result<(), LaunchError> { panic!("guard must not run without a program") };
    let error = launch::open(&app("formcut"), None, &[], &mut guard).unwrap_err();
    assert_eq!(error.to_string(), "FormCut is not installed on this computer");
}

#[test]
fn a_program_the_guard_refuses_is_never_started() {
    let c = Config::new("guard");
    let marker = c.path("started");
    let program = c.program("bin/formcut", &format!("echo yes > {}", marker.display()));
    let mut seen: Option<PathBuf> = None;
    let mut guard = |p: &Path| {
        seen = Some(p.to_path_buf());
        Err(LaunchError::Failed("FormCut was not opened: test refusal".into()))
    };
    let error = launch::open(&app("formcut"), Some(&program), &[], &mut guard).unwrap_err();
    assert_eq!(error.to_string(), "FormCut was not opened: test refusal");
    assert_eq!(seen.as_deref(), Some(program.as_path()));
    std::thread::sleep(Duration::from_millis(300));
    assert!(!marker.exists());
}

#[test]
fn a_started_program_is_told_it_is_hosted_and_runs_from_its_own_folder() {
    let c = Config::new("hosted");
    let marker = c.path("report");
    let program = c.program("bin/formcut", &format!("echo \"$1|$FORMTRAY_HOSTED|$(pwd)\" > {}", marker.display()));
    let mut guard = |_: &Path| Ok(());
    launch::open(&app("formcut"), Some(&program), &[], &mut guard).unwrap();
    let report = wait_for(&marker);
    let folder = std::fs::canonicalize(c.path("bin")).unwrap();
    assert_eq!(report.trim(), format!("{}|{}|{}", launch::HOSTED_FLAG, launch::HOSTED_ENV_VALUE, folder.display()));
    assert_eq!(launch::HOSTED_FLAG, "--formtray-hosted");
    assert_eq!(launch::HOSTED_ENV, "FORMTRAY_HOSTED");
}

#[test]
fn an_appimage_that_is_not_executable_is_made_executable_before_it_starts() {
    let c = Config::new("appimage");
    let marker = c.path("ran");
    let program = c.program("bin/FormCut-1.0.AppImage", &format!("echo ran > {}", marker.display()));
    std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o644)).unwrap();
    let mut guard = |_: &Path| Ok(());
    launch::open(&app("formcut"), Some(&program), &[], &mut guard).unwrap();
    assert_eq!(wait_for(&marker).trim(), "ran");
    assert_ne!(std::fs::metadata(&program).unwrap().permissions().mode() & 0o111, 0);
}

#[test]
fn a_program_that_cannot_be_started_is_reported_with_the_systems_reason() {
    let c = Config::new("nostart");
    let program = c.path("bin/formcut");
    std::fs::create_dir_all(c.path("bin")).unwrap();
    std::fs::write(&program, "plain text, not a program").unwrap();
    std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o644)).unwrap();
    let mut guard = |_: &Path| Ok(());
    let error = launch::open(&app("formcut"), Some(&program), &[], &mut guard).unwrap_err();
    assert!(matches!(error, LaunchError::Failed(_)), "{error}");
    assert!(error.to_string().to_lowercase().contains("permission denied"), "{error}");
}

#[test]
fn quitting_with_no_process_says_the_app_is_not_running() {
    let error = launch::quit(&app("formpdf"), &[]).unwrap_err();
    assert_eq!(error.to_string(), "FormPDF is not running");
}

#[test]
fn quitting_sends_a_terminate_signal_to_the_running_process() {
    let mut child: Child = Command::new("sleep").arg("30").stdin(Stdio::null()).spawn().unwrap();
    launch::quit(&app("formpdf"), &[child.id()]).unwrap();
    let start = Instant::now();
    let status = loop {
        if let Some(s) = child.try_wait().unwrap() {
            break s;
        }
        if start.elapsed() > Duration::from_secs(5) {
            let _ = child.kill();
            panic!("the process did not end");
        }
        std::thread::sleep(Duration::from_millis(25));
    };
    assert_eq!(status.signal(), Some(15));
}

struct Fake {
    child: Child,
    _dir: PathBuf,
}

impl Drop for Fake {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(&self._dir);
    }
}

fn sleeping_as(name: &str) -> Fake {
    static N: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!("formtray-run-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
    std::fs::create_dir_all(&dir).unwrap();
    let copy = dir.join(name);
    let this_program = std::env::current_exe().unwrap();
    if std::fs::hard_link(&this_program, &copy).is_err() {
        std::fs::copy(&this_program, &copy).unwrap();
    }
    let mut child = Command::new(&copy)
        .args(["--ignored", "--exact", STAND_IN])
        .env("FORMTRAY_STAND_IN", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    std::thread::sleep(Duration::from_millis(100));
    assert!(child.try_wait().unwrap().is_none(), "the stand-in program ended at once, so nothing is running under the name {name}");
    Fake { child, _dir: dir }
}

const STAND_IN: &str = "stand_in_program_that_waits";

#[test]
#[ignore = "not a check: this is the program the tests below start under an app's name, and it waits only when they start it"]
fn stand_in_program_that_waits() {
    if std::env::var_os("FORMTRAY_STAND_IN").is_some() {
        std::thread::sleep(Duration::from_secs(30));
    }
}

#[test]
fn a_running_program_named_after_an_app_is_seen_with_its_process_id_and_start_time() {
    let before = now();
    let fake = sleeping_as("formpdf");
    let found = Watcher::new().scan(&Registry::load());
    let run = found.get("formpdf").expect("formpdf seen running");
    assert!(run.pids.contains(&fake.child.id()));
    assert!(run.since >= before.saturating_sub(2) && run.since <= now() + 2, "since {} now {}", run.since, now());
}

#[test]
fn an_appimage_with_a_version_in_its_name_is_seen_as_the_app() {
    let fake = sleeping_as("FormPDF-2.1.0-x86_64.AppImage");
    let found = Watcher::new().scan(&Registry::load());
    assert!(found.get("formpdf").is_some_and(|r| r.pids.contains(&fake.child.id())));
}

#[test]
fn a_running_program_with_a_longer_name_is_not_taken_for_the_app() {
    let fake = sleeping_as("formpdfplus");
    let found = Watcher::new().scan(&Registry::load());
    assert!(!found.values().any(|r| r.pids.contains(&fake.child.id())));
}

#[test]
fn a_program_that_has_ended_is_no_longer_seen() {
    let mut fake = sleeping_as("formmd");
    let pid = fake.child.id();
    let mut watcher = Watcher::new();
    assert!(watcher.scan(&Registry::load()).get("formmd").is_some_and(|r| r.pids.contains(&pid)));
    fake.child.kill().unwrap();
    fake.child.wait().unwrap();
    assert!(!watcher.scan(&Registry::load()).get("formmd").is_some_and(|r| r.pids.contains(&pid)));
}
