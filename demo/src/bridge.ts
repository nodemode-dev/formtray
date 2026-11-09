import type { Prefs, ShellInfo, Snapshot, View } from "../../frontend/src/bridge";
import pkg from "../../frontend/package.json";
import { Engine, type Platform } from "./engine";
import { sampleDocs } from "./samples";

export type { AppState, PortalUpdate, Prefs, ShellInfo, Snapshot, Tile, View } from "../../frontend/src/bridge";

export const VIEWS: View[] = ["switcher", "stack", "apps", "windows", "widgets"];
export const native = false;

function guess(): Platform {
  const p = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (p.includes("win")) return "windows";
  if (p.includes("mac")) return "macos";
  return "linux";
}

export const engine = new Engine(guess(), sampleDocs);

type Log = (line: string) => void;
let logger: Log = () => undefined;
export function onUiLog(fn: Log): void {
  logger = fn;
}

export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "snapshot":
      return engine.snapshot() as T;
    case "shell_info":
      return { glass: "css", issues: [], wayland: false, version: `${pkg.version} demo` } satisfies ShellInfo as T;
    case "set_prefs":
      return engine.setPrefs(args?.prefs as Prefs) as T;
    case "set_hotkey": {
      const action = String(args?.action);
      const chord = String(args?.chord ?? "");
      try {
        const next = engine.setHotkey(action, chord);
        logger(`hotkey ${action} ${chord || "(default)"}`);
        return next as T;
      } catch (e) {
        throw e instanceof Error ? e.message : String(e);
      }
    }
    case "open_app": {
      const id = String(args?.id);
      try {
        engine.open(id);
        logger(`open ${id}`);
      } catch (e) {
        throw e instanceof Error ? e.message : String(e);
      }
      return undefined as T;
    }
    case "quit_app": {
      const id = String(args?.id);
      try {
        engine.quit(id);
        logger(`quit ${id}`);
      } catch (e) {
        throw e instanceof Error ? e.message : String(e);
      }
      return undefined as T;
    }
    case "rescan": {
      const r = engine.rescan();
      logger("rescan");
      engine.emit("notice", `Looked again: ${r.found} of ${r.total} apps found.`);
      return undefined as T;
    }
    case "updates": {
      const n = (engine.snapshot() as Snapshot).updates.length;
      engine.emit("notice", engine.snapshot().portal ? `FormPortal would open here: ${n} update${n === 1 ? "" : "s"} waiting.` : "FormPortal has no install record on this computer.");
      return undefined as T;
    }
    case "open_demo": {
      const link = document.querySelector<HTMLAnchorElement>(`.demo-links a[data-demo="${String(args?.id)}"]`);
      if (link && link.getAttribute("aria-current") !== "page") location.href = link.href;
      return undefined as T;
    }
    default:
      return undefined as T;
  }
}

export async function on<T>(name: string, cb: (payload: T) => void): Promise<void> {
  engine.subscribe((n, payload) => {
    if (n === name) cb(payload as T);
  });
}
