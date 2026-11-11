use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use formtray_core::{prefs, Engine, Prefs, Registry, Tile, Usage};

const ORDER: [&str; 33] = [
    "formvis", "formlit", "formpath", "formdam", "formref", "formcut", "formvfx", "formencoder", "formwav", "formdesign", "formpdf", "formdeck",
    "formmd", "formsculpt", "formsurface", "formweb", "format", "formcel", "formtxt", "formbench", "formmcp", "formskills", "formportal",
    "formtools", "formfabric", "formmorpheus", "formcraft", "formpromo", "formrig", "formcad", "formnet", "formslot", "subform",
];

static ENV: Mutex<()> = Mutex::new(());

struct Config {
    _lock: MutexGuard<'static, ()>,
    root: PathBuf,
}

impl Config {
    fn new(tag: &str) -> Config {
        let lock = ENV.lock().unwrap_or_else(|e| e.into_inner());
        let root = std::env::temp_dir().join(format!("formtray-settings-{}-{tag}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        std::env::set_var("XDG_CONFIG_HOME", &root);
        std::env::set_var("HOME", &root);
        Config { _lock: lock, root }
    }

    fn file(&self, name: &str) -> PathBuf {
        prefs::dir().join(name)
    }
}

impl Drop for Config {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

#[test]
fn the_registry_yields_the_33_apps_in_order() {
    let registry = Registry::load();
    let ids: Vec<&str> = registry.apps.iter().map(|a| a.id.as_str()).collect();
    assert_eq!(ids, ORDER);
}

#[test]
fn every_app_is_unique_in_a_known_category_and_never_formtray_or_excluded() {
    let registry = Registry::load();
    let categories: HashSet<&str> = registry.categories.iter().map(|c| c.id.as_str()).collect();
    let mut seen = HashSet::new();
    for app in &registry.apps {
        assert!(seen.insert(app.id.as_str()), "{} twice", app.id);
        assert!(categories.contains(app.category.as_str()), "{} is in unknown category {}", app.id, app.category);
        assert!(!app.names.is_empty() && !app.identifiers.is_empty(), "{} has no names or identifiers", app.id);
        assert!(!registry.excluded.contains(&app.id), "{} is excluded and listed", app.id);
        assert_ne!(app.id, "formtray");
    }
}

#[test]
fn an_app_is_found_by_id_name_or_any_of_its_names() {
    let registry = Registry::load();
    for wanted in ["formcut", "FormCut", "FORMCUT"] {
        assert_eq!(registry.get(wanted).map(|a| a.id.as_str()), Some("formcut"), "{wanted}");
    }
    assert_eq!(registry.get("form.md").map(|a| a.id.as_str()), Some("formmd"));
    assert_eq!(registry.get("Form-MD").map(|a| a.id.as_str()), Some("formmd"));
    assert_eq!(registry.get("dam").map(|a| a.id.as_str()), Some("formdam"));
    assert!(registry.get("formtray").is_none());
    assert!(registry.get("nothing-like-this").is_none());
}

#[test]
fn settings_default_when_no_file_exists() {
    let c = Config::new("defaults");
    assert!(!c.file("prefs.json").exists());
    let p = Prefs::load();
    assert_eq!(p.default_view, "widgets");
    assert!(!p.open_at_login);
    assert_eq!(p.pinned.len(), 8);
    assert_eq!(p.widgets.len(), 8);
}

#[test]
fn settings_persist_and_reload_without_a_temporary_file_left() {
    let c = Config::new("persist");
    let mut p = Prefs::load();
    p.default_view = "stack".into();
    p.open_at_login = true;
    p.hidden = vec!["formweb".into()];
    p.pinned = vec!["formcut".into(), "formpdf".into()];
    p.locations = vec![PathBuf::from("/srv/apps")];
    p.widgets = vec![Tile::app("formcut", "l")];
    p.hotkeys.insert("summon".into(), "Super+Shift+KeyF".into());
    p.save().unwrap();
    let back = Prefs::load();
    assert_eq!(back.default_view, "stack");
    assert!(back.open_at_login);
    assert_eq!(back.hidden, p.hidden);
    assert_eq!(back.pinned, p.pinned);
    assert_eq!(back.locations, p.locations);
    assert_eq!(back.widgets, p.widgets);
    assert_eq!(back.hotkeys, p.hotkeys);
    assert!(!c.file("prefs.json.tmp").exists());
}

#[test]
fn a_corrupt_settings_file_falls_back_to_defaults() {
    let c = Config::new("corrupt");
    std::fs::create_dir_all(prefs::dir()).unwrap();
    for bad in ["{not json", "", "[]", "\u{0}\u{0}"] {
        std::fs::write(c.file("prefs.json"), bad).unwrap();
        let p = Prefs::load();
        assert_eq!(p.default_view, "widgets", "{bad:?}");
        assert_eq!(p.pinned.len(), 8, "{bad:?}");
    }
    std::fs::write(c.file("usage.json"), "{oops").unwrap();
    assert!(Usage::load().apps.is_empty());
}

#[test]
fn a_partial_or_unknown_view_keeps_what_is_valid() {
    let c = Config::new("partial");
    std::fs::create_dir_all(prefs::dir()).unwrap();
    std::fs::write(c.file("prefs.json"), r#"{"default_view":"nowhere","hidden":["formcut"],"unknown_field":1}"#).unwrap();
    let p = Prefs::load();
    assert_eq!(p.default_view, "widgets");
    assert_eq!(p.hidden, vec!["formcut".to_string()]);
    assert_eq!(p.pinned.len(), 8);
}

#[test]
fn usage_counts_persist() {
    let _c = Config::new("usage");
    let mut u = Usage::load();
    u.touch("formcut");
    u.touch("formcut");
    u.last_view = "widgets".into();
    u.save().unwrap();
    let back = Usage::load();
    assert_eq!(back.apps["formcut"].count, 2);
    assert!(back.apps["formcut"].last > 0);
    assert_eq!(back.last_view, "widgets");
}

#[test]
fn a_hotkey_that_does_not_parse_is_refused_and_not_saved() {
    let _c = Config::new("hotkey");
    let mut engine = Engine::new();
    let err = engine.set_hotkey("summon", "Bogus+Nope").unwrap_err();
    assert!(err.contains("Bogus+Nope"), "{err}");
    assert!(!Prefs::load().hotkeys.contains_key("summon"));
    engine.set_hotkey("summon", "Control+Alt+Super+KeyJ").unwrap();
    assert_eq!(Prefs::load().hotkeys["summon"], "Control+Alt+Super+KeyJ");
    assert!(engine.set_hotkey("summon", "Control+Alt+Nope").is_err());
    assert_eq!(Prefs::load().hotkeys["summon"], "Control+Alt+Super+KeyJ");
}

#[test]
fn saving_prefs_refuses_a_hotkey_that_does_not_parse() {
    let _c = Config::new("prefs-hotkey");
    let mut engine = Engine::new();
    let mut bad = Prefs::load();
    bad.hotkeys.insert("summon".into(), "Bogus+Nope".into());
    let err = engine.set_prefs(bad).unwrap_err().to_string();
    assert!(err.contains("Bogus+Nope") && err.contains("is not a hotkey FormTray can register"), "{err}");
    assert!(!Prefs::load().hotkeys.contains_key("summon"));
    let mut good = Prefs::load();
    good.hotkeys.insert("summon".into(), "Control+Alt+Super+KeyJ".into());
    engine.set_prefs(good).unwrap();
    assert_eq!(Prefs::load().hotkeys["summon"], "Control+Alt+Super+KeyJ");
}

#[test]
fn saving_prefs_keeps_an_unchanged_hotkey_saved_before_the_check() {
    let _c = Config::new("prefs-hotkey-old");
    let mut old = Prefs::load();
    old.hotkeys.insert("summon".into(), "Bogus+Nope".into());
    old.save().unwrap();
    let mut engine = Engine::new();
    let mut next = Prefs::load();
    next.open_at_login = !next.open_at_login;
    let want = next.open_at_login;
    engine.set_prefs(next).unwrap();
    assert_eq!(Prefs::load().open_at_login, want);
}
