use formai_core::Engine;

const HELP: &str = "formai-cli: the Form apps from the command line

  list            every Form app, whether it is installed and running
  list --json     the same as JSON
  open <app>      open an app, or bring it forward if it is running
  quit <app>      quit a running app
  hotkeys         this computer's FormAI hotkeys
  hotkey <action> <chord>   change one hotkey, or give \"\" to go back to the default
  updates         updates FormPortal has seen for installed apps (read only, no network)
  where           where FormAI keeps its preferences

<app> is an id or a name: formcut, FormVis, form.md";

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
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
                eprintln!("Give an action and a chord, for example: formai-cli hotkey summon Control+Alt+Super+KeyF");
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
            println!("{}", formai_core::prefs::dir().display());
            0
        }
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
        println!("{:<14} {:<12} {:<10} {}", app.id, app.name, state, place);
    }
    0
}

fn act(target: Option<&String>, open: bool) -> i32 {
    let Some(target) = target else {
        eprintln!("Name an app, for example: formai-cli {} formcut", if open { "open" } else { "quit" });
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
