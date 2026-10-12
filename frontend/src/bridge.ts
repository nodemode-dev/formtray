export type View = "switcher" | "stack" | "apps" | "windows" | "widgets" | "prefs";
export const VIEWS: View[] = ["switcher", "stack", "apps", "windows", "widgets"];

export interface Tile {
  kind: "app" | "group" | "updates";
  id: string;
  app: string;
  name: string;
  apps: string[];
  size: "s" | "m" | "l";
}

export interface PortalUpdate {
  id: string;
  from: string;
  to: string;
}

export interface Prefs {
  default_view: View;
  open_at_login: boolean;
  hidden: string[];
  pinned: string[];
  locations: string[];
  widgets: Tile[];
  hotkeys: Record<string, string>;
}

export interface AppState {
  id: string;
  name: string;
  alt_of: string;
  category: string;
  hue: string;
  icon: string;
  installed: boolean;
  path: string | null;
  running: boolean;
  processes: number;
  since: number;
  count: number;
  last: number;
  hidden: boolean;
}

export interface Snapshot {
  categories: { id: string; name: string }[];
  apps: AppState[];
  prefs: Prefs;
  hotkeys: Record<string, string>;
  platform: "macos" | "windows" | "linux";
  portal: boolean;
  updates: PortalUpdate[];
}

export interface ShellInfo {
  glass: "liquid" | "vibrancy" | "acrylic" | "css";
  issues: { action: string; chord: string; reason: string }[];
  wayland: boolean;
  version: string;
}

interface TauriGlobal {
  core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };
  event: { listen<T>(name: string, cb: (e: { payload: T }) => void): Promise<() => void> };
}

const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
export const native = Boolean(tauri);

let preview: Snapshot | null = null;
const previewListeners = new Map<string, ((payload: unknown) => void)[]>();

async function previewSnapshot(): Promise<Snapshot> {
  if (preview) return preview;
  const data = (await import("../../core/data/apps.json")).default as { categories: Snapshot["categories"]; apps: Omit<AppState, "installed" | "path" | "running" | "processes" | "since" | "count" | "last" | "hidden">[] };
  const board = ["formvis", "formcut", "formwav", "formdeck", "formlit", "formdam", "formweb", "formportal"];
  const now = Math.floor(Date.now() / 1000);
  const apps = data.apps.map((a, i) => ({
    ...a,
    installed: i % 6 !== 5,
    path: null,
    running: ["formvis", "formcut", "formwav"].includes(a.id),
    processes: 1,
    since: now - 600 * (i + 1),
    count: board.includes(a.id) ? 9 - board.indexOf(a.id) : 0,
    last: board.includes(a.id) ? now - 900 * (board.indexOf(a.id) + 1) : 0,
    hidden: false,
  }));
  preview = {
    categories: data.categories,
    apps,
    platform: "macos",
    portal: true,
    updates: [{ id: "formvis", from: "1.60.0", to: "1.66.1" }, { id: "formcut", from: "2.6.2", to: "2.8.8" }],
    hotkeys: { switcher: "Alt+Tab", summon: "Control+Alt+Super+Space", "view-switcher": "Control+Alt+Super+Digit1", "view-stack": "Control+Alt+Super+Digit2", "view-apps": "Control+Alt+Super+Digit3", "view-windows": "Control+Alt+Super+Digit4", "view-widgets": "Control+Alt+Super+Digit5" },
    prefs: { default_view: "apps", open_at_login: false, hidden: [], pinned: board, locations: [], widgets: board.map((app, i) => ({ kind: "app" as const, id: app, app, name: "", apps: [], size: i < 2 ? ("l" as const) : ("m" as const) })), hotkeys: {} },
  };
  return preview;
}

export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (tauri) return tauri.core.invoke<T>(cmd, args);
  if (cmd === "snapshot") return (await previewSnapshot()) as T;
  if (cmd === "shell_info") return { glass: "css", issues: [], wayland: false, version: "preview" } as T;
  if (cmd === "set_prefs") {
    const snap = await previewSnapshot();
    snap.prefs = args?.prefs as Prefs;
    return snap as T;
  }
  if (cmd === "set_hotkey") {
    const snap = await previewSnapshot();
    const chord = String(args?.chord ?? "");
    if (chord.toLowerCase() === "super+space") throw "Super+Space is used by Spotlight";
    snap.hotkeys[String(args?.action)] = chord || snap.hotkeys[String(args?.action)];
    return snap as T;
  }
  if (cmd === "open_app") {
    const snap = await previewSnapshot();
    const app = snap.apps.find((a) => a.id === args?.id);
    if (!app?.installed) throw `${app?.name ?? "That app"} is not installed on this computer`;
    return undefined as T;
  }
  return undefined as T;
}

export async function on<T>(name: string, cb: (payload: T) => void): Promise<void> {
  if (tauri) {
    await tauri.event.listen<T>(name, (e) => cb(e.payload));
    return;
  }
  const list = previewListeners.get(name) ?? [];
  list.push(cb as (payload: unknown) => void);
  previewListeners.set(name, list);
}

export function previewEmit(name: string, payload: unknown): void {
  for (const cb of previewListeners.get(name) ?? []) cb(payload);
}
