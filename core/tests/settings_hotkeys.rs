use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, MutexGuard};

use formtray_core::{hotkeys, prefs, Engine};

static ENV: Mutex<()> = Mutex::new(());

struct Config {
    _lock: MutexGuard<'static, ()>,
    root: PathBuf,
}

impl Config {
    fn new(tag: &str) -> Config {
        let lock = ENV.lock().unwrap_or_else(|e| e.into_inner());
        static N: AtomicUsize = AtomicUsize::new(0);
        let root = std::env::temp_dir().join(format!("formtray-hk-{}-{tag}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("portal")).unwrap();
        std::env::set_var("HOME", &root);
        std::env::set_var("XDG_CONFIG_HOME", &root);
        std::env::set_var("XDG_DATA_HOME", root.join("data"));
        std::env::set_var("FORMPORTAL_ROOT", root.join("portal"));
        Config { _lock: lock, root }
    }

    fn saved(&self) -> Option<serde_json::Value> {
        let text = std::fs::read_to_string(prefs::dir().join("prefs.json")).ok()?;
        serde_json::from_str(&text).ok()
    }
}

impl Drop for Config {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

#[test]
fn a_chord_is_normalised_to_full_modifier_names_in_a_fixed_order() {
    assert_eq!(hotkeys::normalise("ctrl+shift+f"), "Control+Shift+F");
    assert_eq!(hotkeys::normalise("cmd+alt+x"), "Alt+Super+X");
    assert_eq!(hotkeys::normalise("super+alt+shift+ctrl+k"), "Control+Shift+Alt+Super+K");
    assert_eq!(hotkeys::normalise(" option + Space "), "Alt+Space");
    assert_eq!(hotkeys::normalise("Win+Meta+Command+Q"), "Super+Super+Super+Q");
}

#[test]
fn normalising_twice_changes_nothing() {
    for chord in ["ctrl+alt+keyf", "Super+Shift+Digit1", "alt+backquote", "control+shift+alt+super+Space"] {
        let once = hotkeys::normalise(chord);
        assert_eq!(hotkeys::normalise(&once), once);
    }
}

#[test]
fn the_key_keeps_its_capitals_after_the_first_letter() {
    assert_eq!(hotkeys::normalise("control+keyF"), "Control+KeyF");
    assert_eq!(hotkeys::normalise("ctrl+digit1"), "Control+Digit1");
}

#[test]
fn chords_made_of_modifiers_and_one_key_parse() {
    for chord in ["Control+Alt+KeyF", "Super+Shift+Digit1", "Alt+Backquote", "Control+Shift+Space", "Control+Alt+Super+KeyF"] {
        assert!(hotkeys::parse(chord).is_ok(), "{chord}");
    }
}

#[test]
fn chords_without_a_key_or_with_a_made_up_key_are_refused_with_an_example() {
    for chord in ["Control+Alt", "", "Control+Alt+Banana", "Control++KeyF", "Hyper+KeyF"] {
        let message = hotkeys::parse(chord).unwrap_err();
        assert_eq!(message, format!("{chord} is not a hotkey FormTray can register; give modifiers and one key, for example Control+Alt+Super+KeyF"));
    }
}

#[test]
fn there_is_a_default_for_every_action_and_nothing_else() {
    let defaults = hotkeys::defaults();
    let mut have: Vec<&str> = defaults.keys().map(String::as_str).collect();
    let mut want: Vec<&str> = hotkeys::ACTIONS.to_vec();
    have.sort();
    want.sort();
    assert_eq!(have, want);
}

#[test]
fn every_default_parses_is_not_reserved_and_is_used_once() {
    let defaults = hotkeys::defaults();
    let mut seen: Vec<String> = Vec::new();
    for (action, chord) in &defaults {
        assert!(hotkeys::parse(chord).is_ok(), "{action}: {chord}");
        assert_eq!(hotkeys::conflict(chord), None, "{action}: {chord}");
        seen.push(chord.to_ascii_lowercase());
    }
    seen.sort();
    seen.dedup();
    assert_eq!(seen.len(), defaults.len());
}

#[test]
fn every_reserved_chord_parses_and_reports_who_owns_it() {
    for (chord, owner) in hotkeys::reserved() {
        assert!(hotkeys::parse(&hotkeys::normalise(chord)).is_ok(), "{chord}");
        assert_eq!(hotkeys::conflict(chord), Some(*owner));
        assert_eq!(hotkeys::conflict(&chord.to_ascii_lowercase()), Some(*owner));
    }
}

#[cfg(target_os = "linux")]
#[test]
fn on_linux_alt_tab_belongs_to_the_desktop_switcher() {
    assert_eq!(hotkeys::conflict("alt+tab"), Some("the desktop app switcher"));
    assert_eq!(hotkeys::conflict("Control+Alt+KeyK"), Some("FormRef click-through"));
    assert_eq!(hotkeys::conflict("Alt+Backquote"), None);
}

#[test]
fn an_override_replaces_the_default_for_its_action_only() {
    let mut set = HashMap::new();
    set.insert("summon".to_string(), "Control+Alt+KeyF".to_string());
    let map = hotkeys::effective(&set);
    let defaults = hotkeys::defaults();
    assert_eq!(map["summon"], "Control+Alt+KeyF");
    for action in hotkeys::ACTIONS.iter().filter(|a| **a != "summon") {
        assert_eq!(map[*action], defaults[*action]);
    }
}

#[test]
fn an_override_on_a_reserved_chord_or_an_unknown_action_is_ignored() {
    let (reserved, _) = hotkeys::reserved()[0];
    let mut set = HashMap::new();
    set.insert("summon".to_string(), reserved.to_string());
    set.insert("teleport".to_string(), "Control+Alt+KeyT".to_string());
    let map = hotkeys::effective(&set);
    assert_eq!(map, hotkeys::defaults());
}

#[test]
fn no_overrides_gives_the_defaults() {
    assert_eq!(hotkeys::effective(&HashMap::new()), hotkeys::defaults());
}

#[test]
fn a_hotkey_set_through_the_engine_is_saved_in_normal_form_and_shown_in_the_snapshot() {
    let c = Config::new("save");
    let mut engine = Engine::new();
    engine.set_hotkey("summon", "ctrl+alt+KeyF").unwrap();
    assert_eq!(c.saved().unwrap()["hotkeys"]["summon"], "Control+Alt+KeyF");
    assert_eq!(engine.snapshot().hotkeys["summon"], "Control+Alt+KeyF");
    let again = Engine::new();
    assert_eq!(again.snapshot().hotkeys["summon"], "Control+Alt+KeyF");
}

#[test]
fn a_hotkey_for_an_action_that_does_not_exist_is_refused() {
    let c = Config::new("action");
    let mut engine = Engine::new();
    assert_eq!(engine.set_hotkey("teleport", "Control+Alt+KeyT").unwrap_err(), "teleport is not a FormTray action");
    assert!(c.saved().is_none());
}

#[test]
fn a_chord_that_cannot_be_registered_is_refused_and_nothing_is_saved() {
    let c = Config::new("badchord");
    let mut engine = Engine::new();
    let error = engine.set_hotkey("summon", "Control+Alt").unwrap_err();
    assert!(error.starts_with("Control+Alt is not a hotkey FormTray can register"), "{error}");
    assert!(c.saved().is_none());
    assert_eq!(engine.snapshot().hotkeys, hotkeys::defaults());
}

#[cfg(target_os = "linux")]
#[test]
fn a_chord_the_desktop_keeps_is_refused_by_name() {
    let c = Config::new("reserved");
    let mut engine = Engine::new();
    assert_eq!(engine.set_hotkey("summon", "alt+tab").unwrap_err(), "Alt+Tab is used by the desktop app switcher");
    assert!(c.saved().is_none());
}

#[test]
fn a_chord_already_given_to_another_action_is_refused_naming_that_action() {
    let c = Config::new("twice");
    let mut engine = Engine::new();
    engine.set_hotkey("summon", "Control+Alt+KeyF").unwrap();
    let error = engine.set_hotkey("switcher", "ctrl+alt+KeyF").unwrap_err();
    assert_eq!(error, "Control+Alt+KeyF is already FormTray's summon hotkey");
    assert_eq!(c.saved().unwrap()["hotkeys"].as_object().unwrap().len(), 1);
}

#[test]
fn a_chord_that_is_another_actions_default_is_refused_too() {
    let _c = Config::new("default");
    let mut engine = Engine::new();
    let taken = hotkeys::defaults()["switcher"].clone();
    let error = engine.set_hotkey("summon", &taken.to_ascii_lowercase()).unwrap_err();
    assert_eq!(error, format!("{taken} is already FormTray's switcher hotkey"));
}

#[test]
fn setting_an_action_again_to_its_own_chord_is_allowed() {
    let _c = Config::new("same");
    let mut engine = Engine::new();
    engine.set_hotkey("summon", "Control+Alt+KeyF").unwrap();
    assert!(engine.set_hotkey("summon", "Control+Alt+KeyF").is_ok());
}

#[test]
fn an_empty_chord_goes_back_to_the_default_and_leaves_no_override_in_the_file() {
    let c = Config::new("reset");
    let mut engine = Engine::new();
    engine.set_hotkey("summon", "Control+Alt+KeyF").unwrap();
    engine.set_hotkey("summon", "  ").unwrap();
    assert!(c.saved().unwrap()["hotkeys"].as_object().unwrap().is_empty());
    assert_eq!(engine.snapshot().hotkeys["summon"], hotkeys::defaults()["summon"]);
}

#[test]
fn a_chord_freed_by_a_reset_can_be_given_to_another_action() {
    let _c = Config::new("free");
    let mut engine = Engine::new();
    engine.set_hotkey("summon", "Control+Alt+KeyF").unwrap();
    engine.set_hotkey("summon", "").unwrap();
    assert!(engine.set_hotkey("switcher", "Control+Alt+KeyF").is_ok());
}

#[test]
fn a_chord_typed_with_a_lower_case_key_is_stored_in_a_form_that_still_parses_and_matches() {
    let c = Config::new("lower");
    let mut engine = Engine::new();
    engine.set_hotkey("summon", "ctrl+alt+keyf").unwrap();
    let stored = c.saved().unwrap()["hotkeys"]["summon"].as_str().unwrap().to_string();
    assert!(stored.eq_ignore_ascii_case("Control+Alt+KeyF"), "{stored}");
    assert!(hotkeys::parse(&stored).is_ok());
}
