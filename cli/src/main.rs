use formai_core::Engine;

const HELP: &str = "formai-cli: the Form apps from the command line

  list            every Form app, whether it is installed and running
  list --json     the same as JSON
  open <app>      open an app, or bring it forward if it is running
  quit <app>      quit a running app
  hotkeys         this computer's FormAI hotkeys
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
