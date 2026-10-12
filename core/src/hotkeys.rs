use std::collections::HashMap;

pub const ACTIONS: [&str; 7] = ["switcher", "summon", "view-switcher", "view-stack", "view-apps", "view-windows", "view-widgets"];

pub fn defaults() -> HashMap<String, String> {
    let pairs: [(&str, &str); 7] = if cfg!(target_os = "macos") {
        [
            ("switcher", "Alt+Tab"),
            ("summon", "Control+Alt+Super+Space"),
            ("view-switcher", "Control+Alt+Super+Digit1"),
            ("view-stack", "Control+Alt+Super+Digit2"),
            ("view-apps", "Control+Alt+Super+Digit3"),
            ("view-windows", "Control+Alt+Super+Digit4"),
            ("view-widgets", "Control+Alt+Super+Digit5"),
        ]
    } else if cfg!(target_os = "windows") {
        [
            ("switcher", "Alt+Backquote"),
            ("summon", "Control+Shift+Space"),
            ("view-switcher", "Control+Shift+Alt+Digit1"),
            ("view-stack", "Control+Shift+Alt+Digit2"),
            ("view-apps", "Control+Shift+Alt+Digit3"),
            ("view-windows", "Control+Shift+Alt+Digit4"),
            ("view-widgets", "Control+Shift+Alt+Digit5"),
        ]
    } else {
        [
            ("switcher", "Alt+Backquote"),
            ("summon", "Super+Shift+Space"),
            ("view-switcher", "Super+Shift+Digit1"),
            ("view-stack", "Super+Shift+Digit2"),
            ("view-apps", "Super+Shift+Digit3"),
            ("view-windows", "Super+Shift+Digit4"),
            ("view-widgets", "Super+Shift+Digit5"),
        ]
    };
    pairs.iter().map(|(a, k)| (a.to_string(), k.to_string())).collect()
}

pub fn reserved() -> &'static [(&'static str, &'static str)] {
    if cfg!(target_os = "macos") {
        &[
            ("Super+Space", "Spotlight"),
            ("Alt+Super+Space", "Spotlight in Finder"),
            ("Control+Super+Space", "Character Viewer"),
            ("Control+Space", "previous input source"),
            ("Control+Alt+Space", "next input source"),
            ("Super+Tab", "the macOS app switcher"),
            ("Super+Backquote", "window cycling"),
            ("Control+ArrowUp", "Mission Control"),
            ("Control+ArrowDown", "app windows"),
            ("Alt+Super+KeyD", "Dock hiding"),
            ("Alt+Super+KeyK", "FormRef click-through"),
        ]
    } else if cfg!(target_os = "windows") {
        &[
            ("Alt+Tab", "the Windows app switcher"),
            ("Control+Alt+Tab", "the persistent app switcher"),
            ("Super+Tab", "Task View"),
            ("Alt+Space", "the window menu"),
            ("Super+Space", "input language"),
            ("Control+Alt+KeyK", "FormRef click-through"),
        ]
    } else {
        &[
            ("Alt+Tab", "the desktop app switcher"),
            ("Super+Tab", "the desktop app switcher"),
            ("Super+Space", "input source"),
            ("Control+Alt+KeyK", "FormRef click-through"),
        ]
    }
}

pub fn normalise(chord: &str) -> String {
    let mut parts: Vec<String> = chord
        .split('+')
        .map(|p| match p.trim().to_ascii_lowercase().as_str() {
            "cmd" | "command" | "super" | "meta" | "win" => "Super".to_string(),
            "ctrl" | "control" => "Control".to_string(),
            "alt" | "option" | "opt" => "Alt".to_string(),
            "shift" => "Shift".to_string(),
            other => {
                let mut c = other.chars();
                c.next().map(|f| f.to_ascii_uppercase().to_string() + c.as_str()).unwrap_or_default()
            }
        })
        .collect();
    let key = parts.pop().unwrap_or_default();
    let order = ["Control", "Shift", "Alt", "Super"];
    parts.sort_by_key(|p| order.iter().position(|o| o == p).unwrap_or(9));
    parts.push(key);
    parts.join("+")
}

pub fn conflict(chord: &str) -> Option<&'static str> {
    let wanted = normalise(chord).to_ascii_lowercase();
    reserved().iter().find(|(c, _)| normalise(c).to_ascii_lowercase() == wanted).map(|(_, why)| *why)
}

pub fn effective(overrides: &HashMap<String, String>) -> HashMap<String, String> {
    let mut map = defaults();
    for (action, chord) in overrides {
        if ACTIONS.contains(&action.as_str()) && conflict(chord).is_none() {
            map.insert(action.clone(), chord.clone());
        }
    }
    map
}
