#![cfg(all(unix, not(target_os = "macos")))]

use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};

use serde_json::Value;

const BIN: &str = env!("CARGO_BIN_EXE_formtray-cli");

struct Run {
    code: i32,
    out: String,
    err: String,
}

struct Box {
    root: PathBuf,
}

impl Box {
    fn new(tag: &str) -> Box {
        static N: AtomicUsize = AtomicUsize::new(0);
        let root = std::env::temp_dir().join(format!("formtray-cliprog-{}-{tag}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = std::fs::remove_dir_all(&root);
        for dir in ["home/.config", "home/.local/share", "portal", "empty"] {
            std::fs::create_dir_all(root.join(dir)).unwrap();
        }
        Box { root }
    }

    fn path(&self, rel: &str) -> PathBuf {
        self.root.join(rel)
    }

    fn write(&self, rel: &str, text: &str) -> PathBuf {
        let p = self.path(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, text).unwrap();
        p
    }

    fn program(&self, rel: &str) -> PathBuf {
        let p = self.write(rel, "#!/bin/sh\nexit 0\n");
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
        p
    }

    fn portal(&self, installs: &str, released: &[(&str, &str)]) {
        let products: Vec<String> = released
            .iter()
            .map(|(id, version)| format!(r#"{{"id":"{id}","name":"{id}","channels":{{"stable":{{"version":"{version}","artifacts":[{{"platform":"linux"}}]}}}}}}"#))
            .collect();
        self.write("portal/installed.json", &format!(r#"{{"installs":[{installs}]}}"#));
        self.write("portal/catalog/apps.json", &format!(r#"{{"products":[{}]}}"#, products.join(",")));
    }

    fn run(&self, args: &[&str]) -> Run {
        let out = Command::new(BIN)
            .env_clear()
            .env("HOME", self.path("home"))
            .env("XDG_CONFIG_HOME", self.path("home/.config"))
            .env("XDG_DATA_HOME", self.path("home/.local/share"))
            .env("XDG_DATA_DIRS", self.path("empty"))
            .env("FORMPORTAL_ROOT", self.path("portal"))
            .env("PATH", "/usr/bin:/bin")
            .args(args)
            .stdin(Stdio::null())
            .output()
            .unwrap();
        Run { code: out.status.code().unwrap_or(-1), out: String::from_utf8_lossy(&out.stdout).into_owned(), err: String::from_utf8_lossy(&out.stderr).into_owned() }
    }

    fn json(&self, args: &[&str]) -> Value {
        let r = self.run(args);
        assert_eq!(r.code, 0, "{}", r.err);
        serde_json::from_str(&r.out).unwrap_or_else(|e| panic!("{e}: {}", r.out))
    }

    fn prefs(&self) -> Value {
        serde_json::from_str(&std::fs::read_to_string(self.path("home/.config/formtray/prefs.json")).unwrap()).unwrap()
    }
}

impl Drop for Box {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn dev_extension(b: &Box, id: &str, name: &str, version: &str) {
    let manifest = serde_json::json!({
        "format": "formai-package", "format_version": 1, "id": id, "name": name, "version": version, "product": "formtray", "api": "1",
        "entry": { "ui": "index.html" },
        "contributes": { "commands": [{ "id": "greet", "title": "Say hello" }] }
    });
    b.write(&format!("packages/{id}/manifest.json"), &manifest.to_string());
    b.write(&format!("packages/{id}/index.html"), "<!doctype html><title>x</title>");
    b.write(&format!("packages/{id}/notes.txt"), "plain");
    let dev = serde_json::json!({
        "format": "formext-dev-extensions", "format_version": 1, "product": "formtray",
        "extensions": [{ "id": id, "path": b.path(&format!("packages/{id}")).display().to_string(), "added": "2026-11-07T10:00:00Z" }]
    });
    b.write("portal/extensions/formtray/dev.json", &dev.to_string());
}

#[test]
fn no_arguments_prints_the_help_and_exits_zero() {
    let r = Box::new("help").run(&[]);
    assert_eq!(r.code, 0);
    assert!(r.out.starts_with("formtray-cli: the Form apps from the command line"), "{}", r.out);
    for word in ["list", "open <app>", "quit <app>", "hotkeys", "hotkey <action> <chord>", "updates", "where", "extensions_list"] {
        assert!(r.out.contains(word), "help lacks {word}");
    }
}

#[test]
fn help_and_dash_dash_help_exit_zero_with_the_same_text() {
    let b = Box::new("help2");
    let none = b.run(&[]).out;
    for arg in ["help", "--help"] {
        let r = b.run(&[arg]);
        assert_eq!((r.code, r.out.as_str()), (0, none.as_str()), "{arg}");
    }
}

#[test]
fn an_unknown_command_prints_the_help_and_exits_two() {
    let r = Box::new("unknown").run(&["frobnicate"]);
    assert_eq!(r.code, 2);
    assert!(r.out.contains("formtray-cli: the Form apps from the command line"));
}

#[test]
fn a_leading_cli_word_is_ignored_so_the_launcher_form_works() {
    let b = Box::new("leadingcli");
    assert_eq!(b.run(&["cli", "where"]).out, b.run(&["where"]).out);
}

#[test]
fn where_prints_the_formtray_folder_under_the_config_folder() {
    let b = Box::new("where");
    let r = b.run(&["where"]);
    assert_eq!(r.code, 0);
    assert_eq!(r.out.trim(), b.path("home/.config/formtray").display().to_string());
}

#[test]
fn the_hotkey_list_has_one_line_per_action_sorted_by_action_name() {
    let r = Box::new("hotkeys").run(&["hotkeys"]);
    assert_eq!(r.code, 0);
    let lines: Vec<Vec<&str>> = r.out.lines().map(|l| l.split_whitespace().collect()).collect();
    let actions: Vec<&str> = lines.iter().map(|l| l[0]).collect();
    assert_eq!(actions, vec!["summon", "switcher", "view-apps", "view-stack", "view-switcher", "view-widgets", "view-windows"]);
    assert!(lines.iter().all(|l| l.len() == 2));
}

#[test]
fn the_hotkey_list_shows_the_linux_defaults_from_the_readme() {
    let r = Box::new("defaults").run(&["hotkeys"]);
    let chords: std::collections::HashMap<&str, &str> = r.out.lines().filter_map(|l| l.split_once(' ')).map(|(a, c)| (a, c.trim())).collect();
    assert_eq!(chords["switcher"], "Alt+Backquote");
}

#[test]
fn changing_a_hotkey_exits_zero_prints_nothing_and_shows_in_the_list_and_the_file() {
    let b = Box::new("rebind");
    let set = b.run(&["hotkey", "summon", "ctrl+alt+KeyF"]);
    assert_eq!((set.code, set.out.as_str(), set.err.as_str()), (0, "", ""));
    let list = b.run(&["hotkeys"]).out;
    assert!(list.lines().any(|l| l.split_whitespace().collect::<Vec<_>>() == ["summon", "Control+Alt+KeyF"]), "{list}");
    assert_eq!(b.prefs()["hotkeys"]["summon"], "Control+Alt+KeyF");
}

#[test]
fn giving_an_empty_chord_puts_the_default_hotkey_back() {
    let b = Box::new("reset");
    let defaults = b.run(&["hotkeys"]).out;
    assert_eq!(b.run(&["hotkey", "summon", "Control+Alt+KeyF"]).code, 0);
    assert_ne!(b.run(&["hotkeys"]).out, defaults);
    assert_eq!(b.run(&["hotkey", "summon", ""]).code, 0);
    assert_eq!(b.run(&["hotkeys"]).out, defaults);
}

#[test]
fn a_hotkey_the_desktop_keeps_is_refused_with_exit_one_and_the_reason_on_stderr() {
    let b = Box::new("reserved");
    let r = b.run(&["hotkey", "summon", "Alt+Tab"]);
    assert_eq!(r.code, 1);
    assert_eq!(r.err.trim(), "Alt+Tab is used by the desktop app switcher");
    assert_eq!(r.out, "");
    assert!(!b.path("home/.config/formtray/prefs.json").exists());
}

#[test]
fn a_chord_that_cannot_be_registered_is_refused_with_an_example() {
    let r = Box::new("badchord").run(&["hotkey", "summon", "Control+Alt"]);
    assert_eq!(r.code, 1);
    assert!(r.err.contains("Control+Alt is not a hotkey FormTray can register"), "{}", r.err);
    assert!(r.err.contains("Control+Alt+Super+KeyF"));
}

#[test]
fn a_hotkey_for_an_action_that_does_not_exist_is_refused() {
    let r = Box::new("noaction").run(&["hotkey", "teleport", "Control+Alt+KeyT"]);
    assert_eq!(r.code, 1);
    assert_eq!(r.err.trim(), "teleport is not a FormTray action");
}

#[test]
fn a_chord_already_used_by_another_hotkey_is_refused_in_a_later_run() {
    let b = Box::new("clash");
    assert_eq!(b.run(&["hotkey", "summon", "Control+Alt+KeyF"]).code, 0);
    let r = b.run(&["hotkey", "switcher", "Control+Alt+KeyF"]);
    assert_eq!(r.code, 1);
    assert_eq!(r.err.trim(), "Control+Alt+KeyF is already FormTray's summon hotkey");
}

#[test]
fn the_hotkey_command_without_a_chord_asks_for_one_and_exits_two() {
    let b = Box::new("hotkeyargs");
    for args in [&["hotkey"][..], &["hotkey", "summon"][..]] {
        let r = b.run(args);
        assert_eq!(r.code, 2, "{args:?}");
        assert!(r.err.starts_with("Give an action and a chord"), "{}", r.err);
    }
}

#[test]
fn opening_or_quitting_without_a_name_asks_for_one_and_exits_two() {
    let b = Box::new("noname");
    let open = b.run(&["open"]);
    assert_eq!(open.code, 2);
    assert_eq!(open.err.trim(), "Name an app, for example: formtray-cli open formcut");
    let quit = b.run(&["quit"]);
    assert_eq!(quit.code, 2);
    assert_eq!(quit.err.trim(), "Name an app, for example: formtray-cli quit formcut");
}

#[test]
fn opening_or_quitting_something_that_is_not_a_form_app_exits_one_naming_it() {
    let b = Box::new("notapp");
    for verb in ["open", "quit"] {
        let r = b.run(&[verb, "notepad"]);
        assert_eq!(r.code, 1, "{verb}");
        assert_eq!(r.err.trim(), "notepad is not installed on this computer");
    }
}

#[test]
fn formtray_itself_cannot_be_opened_from_its_own_list() {
    let r = Box::new("self").run(&["open", "formtray"]);
    assert_eq!(r.code, 1);
    assert_eq!(r.err.trim(), "formtray is not installed on this computer");
}

#[test]
fn updates_says_when_formportal_has_no_install_record() {
    let r = Box::new("noportal").run(&["updates"]);
    assert_eq!(r.code, 0);
    assert_eq!(r.out.trim(), "FormPortal has no install record on this computer.");
}

#[test]
fn updates_says_when_there_are_none() {
    let b = Box::new("nonews");
    b.portal("", &[]);
    let r = b.run(&["updates"]);
    assert_eq!(r.code, 0);
    assert_eq!(r.out.trim(), "FormPortal has seen no updates for installed apps.");
}

#[test]
fn updates_lists_each_app_with_its_installed_and_newer_version() {
    let b = Box::new("news");
    let folder = b.path("portal/apps/formrec");
    b.program("portal/apps/formrec/formrec");
    b.portal(&format!(r#"{{"product":"formrec","channel":"stable","current":{{"version":"1.9.0","path":"{}"}}}}"#, folder.display()), &[("formrec", "1.10.0")]);
    let r = b.run(&["updates"]);
    assert_eq!(r.code, 0);
    assert_eq!(r.out, format!("{:<14} 1.9.0 -> 1.10.0\n", "formrec"));
}

#[test]
fn a_same_numbered_version_with_a_leading_v_is_no_update() {
    let b = Box::new("samever");
    let folder = b.path("portal/apps/formrec");
    b.program("portal/apps/formrec/formrec");
    b.portal(&format!(r#"{{"product":"formrec","channel":"stable","current":{{"version":"2.0.0","path":"{}"}}}}"#, folder.display()), &[("formrec", "v2.0")]);
    assert_eq!(b.run(&["updates"]).out.trim(), "FormPortal has seen no updates for installed apps.");
}

#[test]
fn the_json_list_has_one_object_per_app_with_the_fields_a_program_reads() {
    let b = Box::new("json");
    b.portal("", &[("formrec", "1.0.0")]);
    let apps = b.json(&["list", "--json"]);
    let apps = apps.as_array().unwrap();
    assert!(apps.iter().any(|a| a["id"] == "formrec"));
    for a in apps {
        for key in ["id", "name", "category", "installed", "running", "processes", "count", "hidden", "name_source"] {
            assert!(a.get(key).is_some(), "{} lacks {key}", a["id"]);
        }
        assert_ne!(a["id"], "formtray");
    }
    let mut ids: Vec<&str> = apps.iter().map(|a| a["id"].as_str().unwrap()).collect();
    let n = ids.len();
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), n);
}

#[test]
fn the_text_list_header_counts_agree_with_the_json_list() {
    let b = Box::new("counts");
    b.program("home/.local/bin/formwav");
    b.portal("", &[("formwav", "1.0.0")]);
    let apps = b.json(&["list", "--json"]);
    let total = apps.as_array().unwrap().len();
    let installed = apps.as_array().unwrap().iter().filter(|a| a["installed"] == true).count();
    let text = b.run(&["list"]).out;
    assert_eq!(text.lines().next().unwrap(), format!("{total} Form apps, {installed} installed on this computer"));
    assert_eq!(text.lines().count(), total + 2);
}

#[test]
fn an_app_in_the_home_local_bin_shows_as_installed_with_its_path_in_both_lists() {
    let b = Box::new("installed");
    let program = b.program("home/.local/bin/formwav");
    b.portal("", &[("formwav", "1.0.0")]);
    let wav = b.json(&["list", "--json"]).as_array().unwrap().iter().find(|a| a["id"] == "formwav").cloned().unwrap();
    assert_eq!(wav["installed"], true);
    assert_eq!(wav["path"], program.display().to_string());
    let line = b.run(&["list"]).out.lines().find(|l| l.starts_with("formwav ")).unwrap().to_string();
    let cells: Vec<&str> = line.split_whitespace().collect();
    assert_eq!(cells[0], "formwav");
    assert!(cells.contains(&"installed") || cells.contains(&"running"), "{line}");
    assert_eq!(*cells.last().unwrap(), program.display().to_string());
}

#[test]
fn an_app_not_on_the_computer_is_listed_as_not_found_with_no_path() {
    let b = Box::new("notfound");
    b.portal("", &[("formwav", "1.0.0")]);
    let wav = b.json(&["list", "--json"]).as_array().unwrap().iter().find(|a| a["id"] == "formwav").cloned().unwrap();
    assert_eq!(wav["installed"], false);
    assert!(wav["path"].is_null());
    let line = b.run(&["list"]).out.lines().find(|l| l.starts_with("formwav ")).unwrap().to_string();
    assert!(line.contains("not found"), "{line}");
}

#[test]
fn a_catalogue_name_is_shown_as_the_portals_when_the_app_has_no_name_of_its_own() {
    let b = Box::new("portalname");
    b.portal("", &[("formwav", "1.0.0")]);
    let wav = b.json(&["list", "--json"]).as_array().unwrap().iter().find(|a| a["id"] == "formwav").cloned().unwrap();
    assert_eq!(wav["name_source"], "portal");
    assert_eq!(wav["name"], "FormWav");
}

#[test]
fn opening_an_installed_app_exits_zero_and_the_next_list_counts_one_use() {
    let b = Box::new("openuse");
    b.program("home/.local/bin/formwav");
    b.portal("", &[("formwav", "1.0.0")]);
    let r = b.run(&["open", "FormWav"]);
    assert_eq!((r.code, r.err.as_str()), (0, ""));
    let wav = b.json(&["list", "--json"]).as_array().unwrap().iter().find(|a| a["id"] == "formwav").cloned().unwrap();
    assert_eq!(wav["count"], 1);
    assert!(wav["last"].as_u64().unwrap() > 0);
}

#[test]
fn a_portal_installed_app_whose_program_was_changed_is_refused_with_the_reinstall_advice() {
    let b = Box::new("tampered");
    let folder = b.path("portal/apps/formwav/1.0.0");
    b.program("portal/apps/formwav/1.0.0/formwav");
    let files = b.write(
        "portal/apps/formwav/1.0.0.files.json",
        &serde_json::json!({"format": "formportal-files", "product": "formwav", "version": "1.0.0", "files": {"formwav": "0".repeat(64)}}).to_string(),
    );
    b.portal(
        &format!(r#"{{"product":"formwav","channel":"stable","current":{{"version":"1.0.0","path":"{}","files":"{}"}}}}"#, folder.display(), files.display()),
        &[("formwav", "1.0.0")],
    );
    let r = b.run(&["open", "formwav"]);
    assert_eq!(r.code, 1);
    assert_eq!(r.err.trim(), "FormWav was not opened: its program file is not the one FormPortal installed. Install FormWav again with FormPortal.");
}

#[test]
fn the_extension_list_json_reports_this_programs_own_version_and_the_host_contract() {
    let b = Box::new("extjson");
    let doc = b.json(&["extensions_list", "--json"]);
    assert_eq!(doc["appVersion"], env!("CARGO_PKG_VERSION"));
    assert_eq!(doc["product"], "formtray");
    assert_eq!(doc["app"], "FormTray");
    assert_eq!(doc["api"], "1");
    assert_eq!(doc["extensions"].as_array().unwrap().len(), 0);
}

#[test]
fn with_no_extensions_the_plain_list_says_where_to_find_them() {
    let r = Box::new("extnone").run(&["extensions_list"]);
    assert_eq!(r.code, 0);
    assert_eq!(r.out.trim(), "No extensions yet. Find them in FormPortal or make one with form.ext.");
}

#[test]
fn a_development_extension_is_listed_with_its_commands_in_both_forms() {
    let b = Box::new("extlist");
    dev_extension(&b, "hello", "Hello", "1.2.3");
    let text = b.run(&["extensions_list"]).out;
    let first: Vec<&str> = text.lines().next().unwrap().split_whitespace().collect();
    assert_eq!(first, ["hello", "Hello", "1.2.3", "development", "ready"]);
    assert!(text.lines().nth(1).unwrap().trim_start().starts_with("Say hello (greet)"), "{text}");
    let doc = b.json(&["extensions_list", "--json"]);
    let ext = &doc["extensions"][0];
    assert_eq!((ext["id"].as_str(), ext["version"].as_str(), ext["state"].as_str()), (Some("hello"), Some("1.2.3"), Some("ready")));
    assert_eq!(ext["commands"][0]["id"], "greet");
}

#[test]
fn an_extension_for_another_product_is_listed_as_refused_with_both_names() {
    let b = Box::new("extrefused");
    dev_extension(&b, "hello", "Hello", "1.2.3");
    let path = b.path("packages/hello/manifest.json");
    let text = std::fs::read_to_string(&path).unwrap().replace("\"product\":\"formtray\"", "\"product\":\"formcut\"");
    std::fs::write(&path, text).unwrap();
    let line = b.run(&["extensions_list"]).out.lines().next().unwrap().to_string();
    assert!(line.contains("refused:") && line.contains("formcut") && line.contains("FormTray"), "{line}");
}

#[test]
fn running_an_extension_command_with_nothing_given_asks_for_both_and_exits_two() {
    let r = Box::new("extcmd").run(&["extension_command", "hello"]);
    assert_eq!(r.code, 2);
    assert!(r.err.starts_with("Give an extension id and a command"));
}

#[test]
fn extension_command_arguments_that_are_not_json_are_refused_before_anything_is_sent() {
    let b = Box::new("extjsonarg");
    let r = b.run(&["extension_command", "hello", "greet", "{not json"]);
    assert_eq!(r.code, 2);
    assert!(r.err.starts_with("The arguments are not JSON"), "{}", r.err);
    assert!(!b.path("portal/extensions").exists());
}

#[test]
fn a_command_for_an_extension_that_is_not_there_exits_one_naming_it() {
    let r = Box::new("extmissing").run(&["extension_command", "nope", "greet"]);
    assert_eq!(r.code, 1);
    assert_eq!(r.err.trim(), "FormTray has no extension nope");
}

#[test]
fn a_command_the_extension_does_not_have_exits_one_naming_extension_and_command() {
    let b = Box::new("extnocmd");
    dev_extension(&b, "hello", "Hello", "1.2.3");
    let r = b.run(&["extension_command", "hello", "dance"]);
    assert_eq!(r.code, 1);
    assert_eq!(r.err.trim(), "Hello has no command dance");
}

#[test]
fn a_command_for_a_refused_extension_says_it_is_refused_and_why() {
    let b = Box::new("extrefusedcmd");
    dev_extension(&b, "hello", "Hello", "1.2.3");
    let path = b.path("packages/hello/manifest.json");
    std::fs::write(&path, std::fs::read_to_string(&path).unwrap().replace("\"api\":\"1\"", "\"api\":\"2\"")).unwrap();
    let r = b.run(&["extension_command", "hello", "greet"]);
    assert_eq!(r.code, 1);
    assert!(r.err.starts_with("Hello is refused: "), "{}", r.err);
}

#[test]
fn extension_file_prints_the_path_type_and_security_headers_of_a_file_inside_the_package() {
    let b = Box::new("extfile");
    dev_extension(&b, "hello", "Hello", "1.2.3");
    let r = b.run(&["extension_file", "hello", "1.2.3", "index.html"]);
    assert_eq!(r.code, 0, "{}", r.err);
    let doc: Value = serde_json::from_str(&r.out).unwrap();
    assert_eq!(doc["path"], std::fs::canonicalize(b.path("packages/hello/index.html")).unwrap().display().to_string());
    assert!(doc["type"].as_str().unwrap().starts_with("text/html"));
    assert_eq!(doc["headers"]["X-Content-Type-Options"], "nosniff");
    assert!(doc["headers"]["Content-Security-Policy"].is_string());
}

#[test]
fn extension_file_refuses_a_path_outside_the_package_a_wrong_version_and_an_unknown_type() {
    let b = Box::new("extfilerefuse");
    dev_extension(&b, "hello", "Hello", "1.2.3");
    b.write("packages/secret.html", "secret");
    for args in [
        ["extension_file", "hello", "1.2.3", "../secret.html"],
        ["extension_file", "hello", "9.9.9", "index.html"],
        ["extension_file", "hello", "1.2.3", "missing.html"],
        ["extension_file", "nobody", "1.2.3", "index.html"],
    ] {
        let r = b.run(&args);
        assert_eq!((r.code, r.out.as_str()), (1, ""), "{args:?}");
    }
}

#[test]
fn extension_file_with_missing_arguments_exits_two() {
    let b = Box::new("extfileargs");
    assert_eq!(b.run(&["extension_file", "hello"]).code, 2);
    assert_eq!(b.run(&["extension_file"]).code, 2);
}
