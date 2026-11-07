import { ACTIONS, configDir, resolveApp } from "./engine";
import { engine } from "./bridge";

const HELP = `formtray-cli: the Form apps from the command line

  list            every Form app, whether it is installed and running
  list --json     the same as JSON
  open <app>      open an app, or bring it forward if it is running
  quit <app>      quit a running app
  hotkeys         this computer's FormTray hotkeys
  hotkey <action> <chord>   change one hotkey, or give "" to go back to the default
  updates         updates FormPortal has seen for installed apps (read only, no network)
  where           where FormTray keeps its preferences

<app> is an id or a name: formcut, FormVis, form.md`;

type Kind = "out" | "err" | "cmd" | "ui";

export interface Console {
  print(text: string, kind?: Kind): void;
  run(line: string): void;
}

function tokens(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2]);
  return out;
}

export function mountConsole(log: HTMLElement, form: HTMLFormElement, input: HTMLInputElement, chips: HTMLElement): Console {
  const history: string[] = [];
  let at = 0;

  function print(text: string, kind: Kind = "out") {
    const line = document.createElement("div");
    line.className = `cl-line cl-${kind}`;
    line.textContent = text;
    log.append(line);
    log.scrollTop = log.scrollHeight;
  }

  function list(json: boolean) {
    const snap = engine.snapshot();
    if (json) {
      print(JSON.stringify(snap.apps, null, 2));
      return 0;
    }
    const installed = snap.apps.filter((a) => a.installed).length;
    print(`${snap.apps.length} Form apps, ${installed} installed on this computer\n`);
    for (const a of snap.apps) {
      const state = a.running ? "running" : a.installed ? "installed" : "not found";
      print(`${a.id.padEnd(14)} ${a.name.padEnd(14)} ${a.name_source.padEnd(9)} ${state.padEnd(10)} ${a.path ?? ""}`.trimEnd());
    }
    return 0;
  }

  function act(target: string | undefined, open: boolean) {
    if (!target) {
      print(`Name an app, for example: formtray-cli ${open ? "open" : "quit"} formcut`, "err");
      return 2;
    }
    try {
      if (open) engine.open(target);
      else engine.quit(target);
      const app = resolveApp(target);
      print(`${open ? "opened" : "quit"} ${app?.id ?? target}${open ? " (launched with --formtray-hosted)" : ""}`, "ui");
      return 0;
    } catch (e) {
      print(e instanceof Error ? e.message : String(e), "err");
      return 1;
    }
  }

  function run(line: string) {
    const text = line.trim();
    if (!text) return;
    history.push(text);
    at = history.length;
    print(`$ formtray cli ${text}`, "cmd");
    const args = tokens(text);
    let code = 0;
    switch (args[0]) {
      case "list":
        code = list(args[1] === "--json");
        break;
      case "open":
        code = act(args[1], true);
        break;
      case "quit":
        code = act(args[1], false);
        break;
      case "hotkeys": {
        const keys = Object.entries(engine.snapshot().hotkeys).sort(([a], [b]) => a.localeCompare(b));
        for (const [action, chord] of keys) print(`${action.padEnd(14)} ${chord}`);
        break;
      }
      case "hotkey":
        if (args[1] !== undefined && args[2] !== undefined) {
          try {
            engine.setHotkey(args[1], args[2]);
          } catch (e) {
            print(e instanceof Error ? e.message : String(e), "err");
            code = 1;
          }
        } else {
          print(`Give an action and a chord, for example: formtray-cli hotkey summon Control+Alt+Super+KeyF\nActions: ${ACTIONS.join(", ")}`, "err");
          code = 2;
        }
        break;
      case "updates": {
        const snap = engine.snapshot();
        if (!snap.portal) print("FormPortal has no install record on this computer.");
        else if (!snap.updates.length) print("FormPortal has seen no updates for installed apps.");
        for (const u of snap.updates) print(`${u.id.padEnd(14)} ${u.from} -> ${u.to}`);
        break;
      }
      case "where":
        print(configDir(engine.platform));
        break;
      default:
        print(HELP);
        code = args[0] === undefined || args[0] === "help" || args[0] === "--help" ? 0 : 2;
    }
    print(`exit ${code}`, "ui");
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = input.value;
    input.value = "";
    run(value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && history.length) {
      at = Math.max(0, at - 1);
      input.value = history[at] ?? "";
      e.preventDefault();
    } else if (e.key === "ArrowDown" && history.length) {
      at = Math.min(history.length, at + 1);
      input.value = history[at] ?? "";
      e.preventDefault();
    }
  });
  chips.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("button[data-cmd]");
    if (b) run(b.dataset.cmd ?? "");
  });

  return { print, run };
}
