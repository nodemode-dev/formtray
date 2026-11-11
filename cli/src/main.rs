use std::time::Duration;

use formtray_core::extensions as ext;
use formtray_core::Engine;

const HELP: &str = "formtray-cli: the Form apps from the command line

  list            every Form app, whether it is installed and running
  list --json     the same as JSON
  open <app>      open an app, or bring it forward if it is running
  quit <app>      quit a running app
  hotkeys         this computer's FormTray hotkeys
  hotkey <action> <chord>   change one hotkey, or give \"\" to go back to the default
  updates         updates FormPortal has seen for installed apps (read only, no network)
  where           where FormTray keeps its preferences
  extensions_list [--json]  the extensions FormTray sees: id, name, version, source, state, commands
  extension_command <id> <command> [args-json]  run an extension's command in the open FormTray window
  extension_file <id> <version> <path>  where an extension file is, for the development server (JSON, exit 1 if refused)

<app> is an id or a name: formcut, FormVis, form.md";

fn main() {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().is_some_and(|a| a.eq_ignore_ascii_case("cli")) {
        args.remove(0);
    }
    let code = match args.first().map(String::as_str) {
        Some("list") => list(args.get(1).is_some_and(|a| a == "--json")),
        Some("open") => act(args.get(1), true),
        Some("quit") => act(args.get(1), false),
        Some("hotkeys") => {
            let engine = Engine::new();
            let mut keys: Vec<_> = engine.snapshot().hotkeys.into_iter().collect();
            keys.sort();
            for (action, chord) in keys {
                println!("{action:<14} {chord}");
            }
            0
        }
        Some("hotkey") => match (args.get(1), args.get(2)) {
            (Some(action), Some(chord)) => match Engine::new().set_hotkey(action, chord) {
                Ok(()) => 0,
                Err(e) => {
                    eprintln!("{e}");
                    1
                }
            },
            _ => {
                eprintln!("Give an action and a chord, for example: formtray-cli hotkey summon Control+Alt+Super+KeyF");
                2
            }
        },
        Some("updates") => {
            let snapshot = Engine::new().snapshot();
            if !snapshot.portal {
                println!("FormPortal has no install record on this computer.");
            } else if snapshot.updates.is_empty() {
                println!("FormPortal has seen no updates for installed apps.");
            }
            for u in &snapshot.updates {
                println!("{:<14} {} -> {}", u.id, u.from, u.to);
            }
            0
        }
        Some("where") => {
            println!("{}", formtray_core::prefs::dir().display());
            0
        }
        Some("extensions_list") => extensions_list(&args[1..]),
        Some("extension_command") => extension_command(&args[1..]),
        Some("extension_file") => extension_file(&args[1..]),
        _ => {
            println!("{HELP}");
            if args.is_empty() || args[0] == "help" || args[0] == "--help" { 0 } else { 2 }
        }
    };
    std::process::exit(code);
}

fn list(json: bool) -> i32 {
    let snapshot = Engine::new().snapshot();
    if json {
        println!("{}", serde_json::to_string_pretty(&snapshot.apps).unwrap_or_default());
        return 0;
    }
    let installed = snapshot.apps.iter().filter(|a| a.installed).count();
    println!("{} Form apps, {} installed on this computer\n", snapshot.apps.len(), installed);
    for app in &snapshot.apps {
        let state = if app.running { "running" } else if app.installed { "installed" } else { "not found" };
        let place = app.path.as_ref().map(|p| p.display().to_string()).unwrap_or_default();
        println!("{:<14} {:<14} {:<9} {:<10} {}", app.id, app.name, app.name_source, state, place);
    }
    0
}

fn resolved() -> Vec<ext::Extension> {
    ext::resolve(ext::PRODUCT, env!("CARGO_PKG_VERSION"), ext::APP_NAME, None)
}

fn extensions_list(args: &[String]) -> i32 {
    let found = resolved();
    if args.iter().any(|a| a == "--json") {
        let base = args.iter().position(|a| a == "--base").and_then(|i| args.get(i + 1)).cloned().unwrap_or_else(|| "formext:/".to_string());
        let (enabled, dev) = ext::stamp(ext::PRODUCT, None);
        let list: Vec<serde_json::Value> = found.iter().map(|e| e.public(&base)).collect();
        let out = serde_json::json!({ "product": ext::PRODUCT, "app": ext::APP_NAME, "appVersion": env!("CARGO_PKG_VERSION"), "api": ext::API, "stamp": [enabled, dev], "extensions": list });
        println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
        return 0;
    }
    if found.is_empty() {
        println!("No extensions yet. Find them in FormPortal or make one with form.ext.");
        return 0;
    }
    for e in &found {
        let name = if e.name.is_empty() { &e.id } else { &e.name };
        let state = if e.state == "ready" { "ready".to_string() } else { format!("refused: {}", e.reason) };
        println!("{:<20} {:<24} {:<8} {:<12} {}", e.id, name, e.version, e.source, state);
        for c in &e.commands {
            println!("{:<20}   {} ({})", "", c["title"].as_str().unwrap_or(""), c["id"].as_str().unwrap_or(""));
        }
    }
    0
}

fn extension_command(args: &[String]) -> i32 {
    let (Some(id), Some(command)) = (args.first(), args.get(1)) else {
        eprintln!("Give an extension id and a command, for example: formtray-cli extension_command hello say-hello");
        return 2;
    };
    let params = match args.get(2) {
        Some(text) => match serde_json::from_str::<serde_json::Value>(text) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("The arguments are not JSON: {e}");
                return 2;
            }
        },
        None => serde_json::json!({}),
    };
    let found = resolved();
    let Some(target) = found.iter().find(|e| &e.id == id) else {
        eprintln!("FormTray has no extension {id}");
        return 1;
    };
    if target.state != "ready" {
        eprintln!("{} is refused: {}", target.name, target.reason);
        return 1;
    }
    if !target.commands.iter().any(|c| c["id"].as_str() == Some(command.as_str())) {
        eprintln!("{} has no command {command}", target.name);
        return 1;
    }
    let req = match ext::submit(id, command, params) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("Could not reach FormTray: {e}");
            return 1;
        }
    };
    match ext::wait(&req, Duration::from_secs(8), Duration::from_secs(400)) {
        ext::Wait::Answered(reply) => {
            if reply["ok"].as_bool() == Some(true) {
                println!("{}", serde_json::to_string_pretty(&reply["result"]).unwrap_or_default());
                0
            } else {
                eprintln!("{} ({})", reply["error"]["message"].as_str().unwrap_or("the command failed"), reply["error"]["code"]);
                1
            }
        }
        ext::Wait::NotTaken => {
            eprintln!("FormTray did not pick up the request. Open FormTray and try again.");
            1
        }
        ext::Wait::TimedOut => {
            eprintln!("FormTray did not answer in time.");
            1
        }
    }
}

fn extension_file(args: &[String]) -> i32 {
    let (Some(id), Some(version), Some(rel)) = (args.first(), args.get(1), args.get(2)) else {
        return 2;
    };
    let found = resolved();
    match ext::file_for(&found, id, version, rel) {
        Some((path, kind)) => {
            let headers: serde_json::Map<String, serde_json::Value> = ext::headers_for(kind, "").into_iter().map(|(k, v)| (k.to_string(), serde_json::Value::String(v))).collect();
            println!("{}", serde_json::json!({ "path": path, "type": kind, "headers": headers }));
            0
        }
        None => 1,
    }
}

fn act(target: Option<&String>, open: bool) -> i32 {
    let Some(target) = target else {
        eprintln!("Name an app, for example: formtray-cli {} formcut", if open { "open" } else { "quit" });
        return 2;
    };
    let mut engine = Engine::new();
    let result = if open { engine.open(target).map(|_| ()) } else { engine.quit(target) };
    match result {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("{e}");
            1
        }
    }
}
