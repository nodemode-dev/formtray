import { call, native, on, type Prefs, type Snapshot, type Tile, type View, VIEWS } from "../bridge";
import { ERR, ExtensionHost, HostError, type ExtensionRecord, type Frame, type Theme } from "./host-bridge";
import { buildSheet, consentCard, dialogCard, type Sheet } from "./sheet";

export type ExtState = "ready" | "needs-permission" | "refused";

export interface Listing {
  product: string;
  app: string;
  appVersion: string;
  stamp: [number, number];
  extensions: ExtensionRecord[];
}

export interface ExtDeps {
  snap(): Snapshot;
  view(): View;
  go(view: View): void;
  open(id: string): void;
  quit(id: string): Promise<void>;
  rescan(): void;
  updates(): void;
  savePrefs(prefs: Prefs): Promise<void>;
  toast(message: string): void;
  show(): void;
}

export interface Docked {
  version: string;
  dispose(): void;
}

export interface ExtApi {
  list(): ExtensionRecord[];
  get(id: string): ExtensionRecord | undefined;
  state(ext: ExtensionRecord): ExtState;
  dockable(id: string, panel: string): boolean;
  subscribe(cb: () => void): void;
  setDock(dock: (id: string, panel: string) => void): void;
  mountPanel(id: string, panel: string, box: HTMLElement, title: HTMLElement): Docked | null;
  run(id: string, command: string, args?: unknown): Promise<unknown>;
  openPanel(id: string, panel: string): void;
  showSheet(): void;
  reload(): Promise<void>;
  manage(): void;
  observe(snap: Snapshot): void;
  viewChanged(view: View): void;
}

const SIZES = ["s", "m", "l"];
const BOARD = ["board.add", "board.remove", "board.resize", "board.move", "group.create", "group.rename", "group.add", "group.remove", "stack.pin", "stack.unpin", "app.hide", "app.unhide"];
const ACTIONS = ["app.open", "app.quit", "view.show", "apps.rescan", "updates.open"];
const CATALOGUE: { id: string; title: string; args?: Record<string, string> }[] = [
  { id: "board.add", title: "Put an app tile on the board", args: { app: "app id", size: "s, m or l (optional)" } },
  { id: "board.remove", title: "Take a tile off the board", args: { tile: "tile id" } },
  { id: "board.resize", title: "Change a tile's size", args: { tile: "tile id", size: "s, m or l" } },
  { id: "board.move", title: "Move a tile in the board order", args: { tile: "tile id", index: "0 is first" } },
  { id: "group.create", title: "Add a group tile", args: { name: "text", apps: "app ids (optional)", size: "s, m or l (optional)" } },
  { id: "group.rename", title: "Rename a group", args: { tile: "group tile id", name: "text" } },
  { id: "group.add", title: "Add an app to a group", args: { tile: "group tile id", app: "app id" } },
  { id: "group.remove", title: "Take an app out of a group", args: { tile: "group tile id", app: "app id" } },
  { id: "stack.pin", title: "Pin an app to the Stack", args: { app: "app id" } },
  { id: "stack.unpin", title: "Unpin an app from the Stack", args: { app: "app id" } },
  { id: "app.hide", title: "Hide an app from every view", args: { app: "app id" } },
  { id: "app.unhide", title: "Show a hidden app again", args: { app: "app id" } },
  { id: "app.open", title: "Open an app or bring it forward", args: { app: "app id" } },
  { id: "app.quit", title: "Quit a running app", args: { app: "app id" } },
  { id: "view.show", title: "Show a formtray view", args: { view: VIEWS.join(", ") } },
  { id: "apps.rescan", title: "Find Apps Again" },
  { id: "updates.open", title: "Open FormPortal for updates" },
];

const refuse = (message: string) => new HostError(ERR.REFUSED, message);

function tileKey(t: Tile): string {
  return (t.kind ?? "app") === "app" ? t.app : t.id;
}

function tileOut(t: Tile): Record<string, unknown> {
  const kind = t.kind ?? "app";
  if (kind === "app") return { tile: t.app, kind, app: t.app, size: t.size };
  if (kind === "group") return { tile: t.id, kind, name: t.name || "Group", apps: [...t.apps], size: t.size };
  if (kind === "extension") return { tile: t.id, kind, extension: t.app, panel: t.name, size: t.size };
  return { tile: t.id, kind, size: t.size };
}

function theme(): Theme {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    mode: matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
    tokens: {
      "--bg": v("--ground"),
      "--panel": v("--pane"),
      "--text": v("--ink"),
      "--muted": v("--ink-soft"),
      "--accent": v("--focus"),
      "--border": v("--edge-strong"),
      "--radius": v("--radius-m"),
      "--font": v("--font"),
    },
  };
}

export async function loadListing(): Promise<Listing> {
  const none: Listing = { product: "formtray", app: "FormTray", appVersion: "", stamp: [0, 0], extensions: [] };
  try {
    if (native) return await call<Listing>("extensions");
    const res = await fetch("/api/extensions", { cache: "no-store" });
    return res.ok ? ((await res.json()) as Listing) : none;
  } catch {
    return none;
  }
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

function pickFiles(accept: string[], multiple: boolean): Promise<{ name: string; type: string; size: number; data: string }[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept.join(",");
    input.multiple = multiple;
    input.hidden = true;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onFocus);
      input.remove();
      fn();
    };
    const onFocus = () => window.setTimeout(() => {
      if (!input.files?.length) finish(() => reject(new HostError(ERR.CANCELLED, "no file was chosen")));
    }, 600);
    input.addEventListener("cancel", () => finish(() => reject(new HostError(ERR.CANCELLED, "no file was chosen"))));
    input.addEventListener("change", async () => {
      const files = [...(input.files ?? [])];
      const total = files.reduce((n, f) => n + f.size, 0);
      if (total > 200 * 1024 * 1024) return finish(() => reject(refuse("the files are larger than 200 MB together")));
      const out = await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type || "application/octet-stream", size: f.size, data: toBase64(await f.arrayBuffer()) })));
      finish(() => resolve(out));
    });
    document.body.append(input);
    window.addEventListener("focus", onFocus, { once: true });
    input.click();
  });
}

export function createExtensions(layer: HTMLElement, deps: ExtDeps, first: Listing): ExtApi {
  let listing = first;
  const listeners: (() => void)[] = [];
  let dock: ((id: string, panel: string) => void) | null = null;
  const docked = new Map<string, { frame: Frame; title: HTMLElement; panel: string }>();
  const starting = new Map<string, Promise<Frame | null>>();
  const hiddenBox = document.createElement("div");
  hiddenBox.className = "ext-hidden";
  hiddenBox.setAttribute("aria-hidden", "true");
  let lastBoard = "";
  let lastRunning = "";

  const get = (id: string) => listing.extensions.find((e) => e.id === id);

  const host = new ExtensionHost({
    product: "formtray",
    app: "FormTray",
    appVersion: listing.appVersion,
    theme,
    notify: (ext, message) => deps.toast(`${ext.name}: ${message}`),
    setTitle: (ext, frame, title) => {
      for (const d of docked.values()) if (d.frame.frame === frame) d.title.textContent = title ? `${ext.name}: ${title}` : d.title.dataset.base ?? ext.name;
    },
    readDocument: (_ext, params) => read(params.what),
    applyDocument: async (ext, label, ops) => {
      const draft = structuredClone(deps.snap().prefs) as Prefs;
      const results: unknown[] = [];
      for (const op of ops) {
        if (!BOARD.includes(op.command)) throw refuse(ACTIONS.includes(op.command) ? `${op.command} is not a board change; run it with app.run` : `formtray has no command ${op.command}`);
        results.push(change(draft, op.command, (op.args ?? {}) as Record<string, unknown>));
      }
      await deps.savePrefs(draft);
      deps.toast(`${ext.name}: ${label}`);
      return { applied: ops.length, results };
    },
    commands: () => CATALOGUE.map((c) => ({ ...c })),
    run: async (_ext, command, args) => {
      const a = (args ?? {}) as Record<string, unknown>;
      if (BOARD.includes(command)) {
        const draft = structuredClone(deps.snap().prefs) as Prefs;
        const result = change(draft, command, a);
        await deps.savePrefs(draft);
        return result;
      }
      return act(command, a);
    },
    openFiles: async (_ext, accept, multiple) => {
      deps.show();
      return pickFiles(accept, multiple);
    },
    consent: (ext) => {
      deps.show();
      return consentCard(layer, ext);
    },
  });

  function app(args: Record<string, unknown>) {
    const id = String(args.app ?? "");
    const found = deps.snap().apps.find((a) => a.id === id);
    if (!found) throw refuse(`formtray has no app ${id || "(none given)"}`);
    return found;
  }

  function size(args: Record<string, unknown>, fallback?: string): Tile["size"] {
    const s = args.size === undefined && fallback ? fallback : String(args.size);
    if (!SIZES.includes(s)) throw refuse(`${s} is not a tile size; use s, m or l`);
    return s as Tile["size"];
  }

  function find(draft: Prefs, args: Record<string, unknown>, kind?: string): number {
    const id = String(args.tile ?? "");
    const i = draft.widgets.findIndex((t) => tileKey(t) === id);
    if (i < 0) throw refuse(`the board has no tile ${id || "(none given)"}`);
    if (kind && (draft.widgets[i].kind ?? "app") !== kind) throw refuse(`${id} is not a ${kind}`);
    return i;
  }

  function change(draft: Prefs, command: string, args: Record<string, unknown>): unknown {
    switch (command) {
      case "board.add": {
        const a = app(args);
        const s = size(args, "m");
        if (draft.widgets.some((t) => (t.kind ?? "app") === "app" && t.app === a.id)) throw refuse(`${a.name} is already on the board`);
        draft.widgets.push({ kind: "app", id: a.id, app: a.id, name: "", apps: [], size: s });
        return { tile: a.id };
      }
      case "board.remove":
        draft.widgets.splice(find(draft, args), 1);
        return null;
      case "board.resize":
        draft.widgets[find(draft, args)].size = size(args);
        return null;
      case "board.move": {
        const i = find(draft, args);
        const to = Number(args.index);
        if (!Number.isInteger(to) || to < 0) throw refuse("index must be a whole number, 0 or more");
        const [t] = draft.widgets.splice(i, 1);
        draft.widgets.splice(Math.min(to, draft.widgets.length), 0, t);
        return null;
      }
      case "group.create": {
        const name = String(args.name ?? "").trim().slice(0, 40) || "Group";
        const apps = Array.isArray(args.apps) ? args.apps.map((id) => app({ app: id }).id) : [];
        let id = `group-${Date.now().toString(36)}`;
        for (let n = 2; draft.widgets.some((t) => t.id === id); n++) id = `group-${Date.now().toString(36)}${n}`;
        draft.widgets.push({ kind: "group", id, app: "", name, apps: [...new Set(apps)], size: size(args, "m") });
        return { tile: id };
      }
      case "group.rename": {
        const name = String(args.name ?? "").trim().slice(0, 40);
        if (!name) throw refuse("give the group a name");
        draft.widgets[find(draft, args, "group")].name = name;
        return null;
      }
      case "group.add": {
        const g = draft.widgets[find(draft, args, "group")];
        const a = app(args);
        if (!g.apps.includes(a.id)) g.apps.push(a.id);
        return null;
      }
      case "group.remove": {
        const g = draft.widgets[find(draft, args, "group")];
        const a = app(args);
        if (!g.apps.includes(a.id)) throw refuse(`${a.name} is not in ${g.name || "the group"}`);
        g.apps = g.apps.filter((id) => id !== a.id);
        return null;
      }
      case "stack.pin": {
        const a = app(args);
        if (!draft.pinned.includes(a.id)) draft.pinned.push(a.id);
        return null;
      }
      case "stack.unpin":
        draft.pinned = draft.pinned.filter((id) => id !== app(args).id);
        return null;
      case "app.hide": {
        const a = app(args);
        if (!draft.hidden.includes(a.id)) draft.hidden.push(a.id);
        return null;
      }
      case "app.unhide":
        draft.hidden = draft.hidden.filter((id) => id !== app(args).id);
        return null;
    }
    throw refuse(`formtray has no command ${command}`);
  }

  async function act(command: string, args: Record<string, unknown>): Promise<unknown> {
    switch (command) {
      case "app.open": {
        const a = app(args);
        if (!a.installed) throw refuse(`${a.name} is not installed on this computer`);
        deps.open(a.id);
        return null;
      }
      case "app.quit": {
        const a = app(args);
        if (!a.running) throw refuse(`${a.name} is not running`);
        await deps.quit(a.id);
        return null;
      }
      case "view.show": {
        const v = String(args.view ?? "") as View;
        if (!VIEWS.includes(v)) throw refuse(`${v || "(none given)"} is not a formtray view; use ${VIEWS.join(", ")}`);
        deps.go(v);
        return null;
      }
      case "apps.rescan":
        deps.rescan();
        return null;
      case "updates.open":
        deps.updates();
        return null;
    }
    throw refuse(`formtray has no command ${command}`);
  }

  function read(what = "all"): unknown {
    const s = deps.snap();
    const p = s.prefs;
    const onBoard = new Set(p.widgets.filter((t) => (t.kind ?? "app") === "app").map((t) => t.app));
    const parts: Record<string, () => unknown> = {
      view: () => deps.view(),
      apps: () => s.apps.map((a) => ({ id: a.id, name: a.name, category: a.category, installed: a.installed, running: a.running, hidden: a.hidden, pinned: p.pinned.includes(a.id), onBoard: onBoard.has(a.id) })),
      board: () => p.widgets.map(tileOut),
      pinned: () => [...p.pinned],
      hidden: () => [...p.hidden],
      portal: () => s.portal,
      updates: () => s.updates.map((u) => ({ app: u.id, from: u.from, to: u.to })),
    };
    if (what === "all") return { product: "formtray", ...Object.fromEntries(Object.entries(parts).map(([k, f]) => [k, f()])) };
    if (what === "updates") return { portal: parts.portal(), updates: parts.updates() };
    if (!(what in parts) || what === "portal") throw new HostError(ERR.INVALID, `what must be one of all, apps, board, pinned, hidden, updates, view`);
    return { [what]: parts[what]() };
  }

  function state(ext: ExtensionRecord): ExtState {
    if (ext.state === "refused") return "refused";
    return host.isGranted(ext) ? "ready" : "needs-permission";
  }

  const sheet: Sheet = buildSheet(layer, {
    state,
    open: (id, panel) => api.openPanel(id, panel),
    allow: async (id) => {
      const ext = get(id);
      if (ext && (await host.ensureConsent(ext))) changed();
    },
    reload: () => api.reload(),
    manage: () => api.manage(),
  });
  layer.append(hiddenBox);

  function changed() {
    sheet.render(listing.extensions);
    for (const cb of listeners) cb();
  }

  function adopt(next: Listing) {
    const before = JSON.stringify(listing.extensions);
    const gone = listing.extensions.filter((e) => !next.extensions.some((n) => n.id === e.id && n.version === e.version && n.state === "ready"));
    listing = next;
    if (JSON.stringify(next.extensions) === before) return;
    for (const e of gone) {
      for (const [key, d] of docked) if (key.startsWith(`${e.id}:`)) d.frame.dispose(), docked.delete(key);
      host.disposeExtension(e.id);
    }
    changed();
  }

  async function refresh(force: boolean) {
    if (force && native) return adopt(await call<Listing>("extensions_reload"));
    if (!force && native) {
      const stamp = await call<[number, number]>("extensions_stamp");
      if (stamp[0] === listing.stamp[0] && stamp[1] === listing.stamp[1]) return;
    }
    const next = await loadListing();
    if (!force && next.stamp[0] === listing.stamp[0] && next.stamp[1] === listing.stamp[1]) return;
    adopt(next);
  }

  window.setInterval(() => {
    if (document.hasFocus()) refresh(false).catch(() => undefined);
  }, 2000);
  on<Listing>("ext:changed", (next) => adopt(next));
  on<null>("ext:sheet", () => sheet.show());
  on<{ id: string; command: string; args?: unknown }>("ext:run", (p) => {
    api.run(p.id, p.command, p.args ?? {}).catch((e) => deps.toast(String((e as Error).message ?? e)));
  });
  on<{ id: string; extension: string; command: string; args?: unknown }>("ext:request", (req) => {
    api
      .run(req.extension, req.command, req.args ?? {})
      .then((result) => call("extension_answer", { id: req.id, reply: { ok: true, result: result ?? null } }))
      .catch((e) => {
        const err = e as { code?: number; message?: string };
        return call("extension_answer", { id: req.id, reply: { ok: false, error: { code: typeof err.code === "number" ? err.code : ERR.REFUSED, message: String(err.message ?? e) } } });
      })
      .catch(() => undefined);
  });
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => host.setTheme(theme()));

  function panelDef(id: string, panel: string) {
    const ext = get(id);
    const def = ext?.panels.find((p) => p.id === panel);
    return ext && def && ext.state === "ready" ? { ext, def } : null;
  }

  const api: ExtApi = {
    list: () => listing.extensions,
    get,
    state,
    dockable: (id, panel) => panelDef(id, panel)?.def.location !== "dialog" && Boolean(panelDef(id, panel)),
    subscribe: (cb) => {
      listeners.push(cb);
    },
    setDock: (d) => {
      dock = d;
    },
    mountPanel(id, panel, box, title) {
      const found = panelDef(id, panel);
      if (!found) return null;
      const { ext, def } = found;
      const key = `${id}:${panel}`;
      title.dataset.base = `${ext.name}: ${def.title}`;
      title.textContent = title.dataset.base;
      let frame: Frame | null = null;
      let gone = false;
      const start = () => {
        box.replaceChildren();
        const opening = host.open(ext, box).then((next) => {
          if (starting.get(key) === opening) starting.delete(key);
          if (!next) return null;
          if (gone) return next.dispose(), null;
          frame = next;
          docked.set(key, { frame, title, panel });
          frame.activate({ reason: "panel", panel }).catch(() => undefined);
          return frame;
        });
        starting.set(key, opening);
      };
      if (host.isGranted(ext)) start();
      else {
        const wait = document.createElement("div");
        wait.className = "ext-wait";
        const text = document.createElement("p");
        text.textContent = "Needs your permission";
        const allow = document.createElement("button");
        allow.type = "button";
        allow.className = "btn";
        allow.textContent = "Allow...";
        allow.addEventListener("click", async () => {
          if (await host.ensureConsent(ext)) {
            start();
            changed();
          }
        });
        wait.append(text, allow);
        box.replaceChildren(wait);
      }
      return {
        version: ext.version,
        dispose: () => {
          gone = true;
          const live = docked.get(key);
          if (live && live.frame === frame) docked.delete(key);
          frame?.dispose();
          box.replaceChildren();
        },
      };
    },
    async run(id, command, args = {}) {
      const ext = get(id);
      if (!ext) throw new HostError(ERR.NOT_FOUND, `formtray has no extension ${id}`);
      if (ext.state !== "ready") throw refuse(`${ext.name} is refused: ${ext.reason}`);
      const def = ext.commands.find((c) => c.id === command);
      if (!def) throw new HostError(ERR.NOT_FOUND, `${ext.name} has no command ${command}`);
      const asked = !host.isGranted(ext);
      if (!(await host.ensureConsent(ext))) throw new HostError(ERR.PERMISSION, `${ext.name} was not allowed to run`);
      if (asked) changed();
      if (!def.panel) return host.runCommand(ext, command, args, hiddenBox);
      const frame = await openPanel(id, def.panel);
      if (!frame) throw refuse(`${ext.name} has no panel ${def.panel}`);
      return frame.activate({ reason: "command", panel: def.panel, command, args });
    },
    openPanel(id, panel) {
      openPanel(id, panel).catch((e) => deps.toast(String((e as Error).message ?? e)));
    },
    showSheet: () => sheet.show(),
    reload: () => refresh(true),
    manage() {
      if (native) call("extensions_manage").catch((e) => deps.toast(String(e)));
      else {
        const a = document.createElement("a");
        a.href = "formai://extensions?product=formtray";
        a.click();
      }
    },
    observe(snap) {
      const p = snap.prefs;
      const board = JSON.stringify([p.widgets.map(tileOut), p.pinned, p.hidden]);
      const running = snap.apps.filter((a) => a.running).map((a) => a.id).join(",");
      if (lastBoard && board !== lastBoard) {
        const [b0, p0, h0] = JSON.parse(lastBoard) as unknown[];
        const [b1, p1, h1] = JSON.parse(board) as unknown[];
        const what = [JSON.stringify(b0) !== JSON.stringify(b1) && "board", JSON.stringify(p0) !== JSON.stringify(p1) && "pinned", JSON.stringify(h0) !== JSON.stringify(h1) && "hidden"].filter(Boolean);
        host.broadcast("document.changed", { what });
      }
      if (lastRunning && running !== lastRunning) host.broadcast("apps.changed", { running: running ? running.split(",") : [] });
      lastBoard = board;
      lastRunning = running || " ";
    },
    viewChanged(view) {
      host.broadcast("selection.changed", { view });
    },
  };

  async function openPanel(id: string, panel: string): Promise<Frame | null> {
    const found = panelDef(id, panel);
    if (!found) throw refuse(`formtray has no panel ${panel} in ${id}`);
    const { ext, def } = found;
    const asked = !host.isGranted(ext);
    if (!(await host.ensureConsent(ext))) throw new HostError(ERR.PERMISSION, `${ext.name} was not allowed to open`);
    if (asked) changed();
    sheet.hide();
    if (def.location === "dialog") {
      deps.show();
      return dialogCard(layer, ext, def.title, async (box) => {
        const frame = await host.open(ext, box, { onResize: (h) => box.style.setProperty("--ext-h", `${Math.min(h, 520)}px`) });
        frame?.activate({ reason: "panel", panel }).catch(() => undefined);
        return frame;
      });
    }
    dock?.(id, panel);
    deps.go("widgets");
    const key = `${id}:${panel}`;
    return docked.get(key)?.frame ?? (await starting.get(key)) ?? null;
  }

  api.observe(deps.snap());
  sheet.render(listing.extensions);
  return api;
}
