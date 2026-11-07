import registryData from "../../core/data/apps.json";
import type { AppState, PortalUpdate, Prefs, Snapshot, Tile, View } from "../../frontend/src/bridge";

export type Platform = "macos" | "windows" | "linux";
export const VIEW_IDS: View[] = ["switcher", "stack", "apps", "windows", "widgets"];
export const ACTIONS = ["switcher", "summon", "view-switcher", "view-stack", "view-apps", "view-windows", "view-widgets"] as const;

interface Entry {
  id: string;
  name: string;
  alt_of: string;
  category: string;
  hue: string;
  icon: string;
  identifiers: string[];
  names: string[];
  opens: string;
}

interface Registry {
  excluded: string[];
  categories: { id: string; name: string }[];
  apps: Entry[];
}

export interface InstalledDoc {
  installs?: { product: string; channel: string; current: { version: string; path: string } }[];
}

export interface CatalogDoc {
  products?: { id: string; name?: string; channels?: Record<string, { version: string; artifacts?: { platform: string }[] }> }[];
}

interface Portal {
  found: boolean;
  installs: { id: string; path: string }[];
  updates: PortalUpdate[];
  names: Map<string, string>;
  released: Set<string>;
}

interface Use {
  count: number;
  last: number;
}

interface Usage {
  apps: Record<string, Use>;
  last_view: string;
}

export const registry = registryData as unknown as Registry;

const DEFAULTS: Record<Platform, Record<string, string>> = {
  macos: {
    switcher: "Alt+Tab",
    summon: "Control+Alt+Super+Space",
    "view-switcher": "Control+Alt+Super+Digit1",
    "view-stack": "Control+Alt+Super+Digit2",
    "view-apps": "Control+Alt+Super+Digit3",
    "view-windows": "Control+Alt+Super+Digit4",
    "view-widgets": "Control+Alt+Super+Digit5",
  },
  windows: {
    switcher: "Alt+Backquote",
    summon: "Control+Shift+Space",
    "view-switcher": "Control+Shift+Alt+Digit1",
    "view-stack": "Control+Shift+Alt+Digit2",
    "view-apps": "Control+Shift+Alt+Digit3",
    "view-windows": "Control+Shift+Alt+Digit4",
    "view-widgets": "Control+Shift+Alt+Digit5",
  },
  linux: {
    switcher: "Alt+Backquote",
    summon: "Super+Shift+Space",
    "view-switcher": "Super+Shift+Digit1",
    "view-stack": "Super+Shift+Digit2",
    "view-apps": "Super+Shift+Digit3",
    "view-windows": "Super+Shift+Digit4",
    "view-widgets": "Super+Shift+Digit5",
  },
};

const RESERVED: Record<Platform, [string, string][]> = {
  macos: [
    ["Super+Space", "Spotlight"],
    ["Alt+Super+Space", "Spotlight in Finder"],
    ["Control+Super+Space", "Character Viewer"],
    ["Control+Space", "previous input source"],
    ["Control+Alt+Space", "next input source"],
    ["Super+Tab", "the macOS app switcher"],
    ["Super+Backquote", "window cycling"],
    ["Control+ArrowUp", "Mission Control"],
    ["Control+ArrowDown", "app windows"],
    ["Alt+Super+KeyD", "Dock hiding"],
    ["Alt+Super+KeyK", "FormRef click-through"],
  ],
  windows: [
    ["Alt+Tab", "the Windows app switcher"],
    ["Control+Alt+Tab", "the persistent app switcher"],
    ["Super+Tab", "Task View"],
    ["Alt+Space", "the window menu"],
    ["Super+Space", "input language"],
    ["Control+Alt+KeyK", "FormRef click-through"],
  ],
  linux: [
    ["Alt+Tab", "the desktop app switcher"],
    ["Super+Tab", "the desktop app switcher"],
    ["Super+Space", "input source"],
    ["Control+Alt+KeyK", "FormRef click-through"],
  ],
};

const MODIFIER_ORDER = ["Control", "Shift", "Alt", "Super"];

export function normalise(chord: string): string {
  const parts = chord.split("+").map((p) => {
    const key = p.trim();
    switch (key.toLowerCase()) {
      case "cmd":
      case "command":
      case "super":
      case "meta":
      case "win":
        return "Super";
      case "ctrl":
      case "control":
        return "Control";
      case "alt":
      case "option":
      case "opt":
        return "Alt";
      case "shift":
        return "Shift";
      default:
        return key.charAt(0).toUpperCase() + key.slice(1);
    }
  });
  const key = parts.pop() ?? "";
  parts.sort((a, b) => {
    const x = MODIFIER_ORDER.indexOf(a);
    const y = MODIFIER_ORDER.indexOf(b);
    return (x < 0 ? 9 : x) - (y < 0 ? 9 : y);
  });
  parts.push(key);
  return parts.join("+");
}

export function familyId(product: string): string {
  const map: Record<string, string> = { formai: "formportal", formslide: "formdeck", formranker: "formbench", formskill: "formskills" };
  return map[product] ?? product;
}

export function productId(id: string): string {
  const map: Record<string, string> = { formportal: "formai", formdeck: "formslide", formbench: "formranker", formskills: "formskill" };
  return map[id] ?? id;
}

export function newer(candidate: string, current: string): boolean {
  const parts = (v: string) =>
    (v.trim().replace(/^v/, "").split(/[-+]/)[0] ?? "").split(".").map((n) => {
      const x = Number.parseInt(n, 10);
      return Number.isNaN(x) ? 0 : x;
    });
  const a = parts(candidate);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

export function opensUnix(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(s);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

function lookup(id: string): Entry | undefined {
  const wanted = id.toLowerCase();
  return registry.apps.find((a) => a.id === wanted || a.name.toLowerCase() === wanted || a.names.some((n) => n.toLowerCase() === wanted));
}

function matchesName(entry: Entry, candidate: string): boolean {
  const c = candidate.toLowerCase();
  return entry.names.some((n) => n.toLowerCase() === c) || entry.name.toLowerCase() === c;
}

function formName(entry: Entry, live: string): string | null {
  const text = live.trim();
  if (!text) return null;
  const base = text.slice(0, 4).toLowerCase() === "form" ? text : `form${text}`;
  if (matchesName(entry, text) || matchesName(entry, base)) return entry.name;
  return base.toLowerCase();
}

export function readPortal(installed: InstalledDoc | null, catalog: CatalogDoc | null, platform: Platform): Portal {
  const state: Portal = { found: false, installs: [], updates: [], names: new Map(), released: new Set() };
  if (!installed) return state;
  state.found = true;
  const products = catalog?.products ?? [];
  for (const p of products) {
    const name = (p.name ?? "").trim();
    if (name) state.names.set(familyId(p.id), name);
  }
  for (const p of products) {
    if (p.channels?.stable?.artifacts?.some((a) => a.platform === platform)) state.released.add(familyId(p.id));
  }
  for (const install of (installed.installs ?? []).filter((i) => i.channel === "stable")) {
    const id = familyId(install.product);
    state.installs.push({ id, path: install.current.path });
    const latest = products.find((p) => p.id === install.product)?.channels?.stable;
    if (latest?.artifacts?.some((a) => a.platform === platform) && newer(latest.version, install.current.version)) {
      state.updates.push({ id, from: install.current.version, to: latest.version });
    }
  }
  return state;
}

export function defaultPrefs(): Prefs {
  const board = ["formvis", "formcut", "formwav", "formdeck", "formlit", "formmd", "formvfx", "formpdf"];
  return {
    default_view: "widgets",
    open_at_login: false,
    hidden: [],
    pinned: [...board],
    locations: [],
    widgets: board.map((app, i): Tile => ({ kind: "app", id: app, app, name: "", apps: [], size: i < 2 ? "l" : "m" })),
    hotkeys: {},
  };
}

export function configDir(platform: Platform): string {
  if (platform === "macos") return "~/Library/Application Support/ai.nodemode.formtray";
  if (platform === "windows") return "C:\\Users\\you\\AppData\\Roaming\\ai.nodemode.formtray";
  return "~/.config/formtray";
}

export function installPath(platform: Platform, entry: Entry): string {
  if (platform === "macos") return `/Applications/${entry.name}.app`;
  if (platform === "windows") return `C:\\Program Files\\${entry.name}\\${entry.name}.exe`;
  return `~/.local/share/formportal/apps/${entry.id}/${entry.name}.AppImage`;
}

export type Listener = (name: string, payload: unknown) => void;

const STORE = "formtray-demo-v1";

interface Stored {
  prefs?: Prefs;
  usage?: Usage;
  platform?: Platform;
  installed?: InstalledDoc;
  catalog?: CatalogDoc;
  clock?: number;
}

export class Engine {
  platform: Platform;
  prefs: Prefs;
  usage: Usage;
  installed: InstalledDoc | null = null;
  catalog: CatalogDoc | null = null;
  custom = false;
  offset = 0;
  private portal: Portal;
  private running = new Map<string, number>();
  private listeners: Listener[] = [];
  private sample: () => { installed: InstalledDoc; catalog: CatalogDoc };

  constructor(platform: Platform, sample: (p: Platform, now: number) => { installed: InstalledDoc; catalog: CatalogDoc }) {
    const stored = Engine.read();
    this.platform = stored.platform ?? platform;
    this.prefs = Engine.cleanPrefs(stored.prefs) ?? defaultPrefs();
    this.usage = stored.usage ?? { apps: {}, last_view: "" };
    this.offset = stored.clock ?? 0;
    this.sample = () => sample(this.platform, this.now());
    if (stored.installed) {
      this.installed = stored.installed;
      this.catalog = stored.catalog ?? null;
      this.custom = true;
    } else {
      this.useSample();
    }
    this.portal = readPortal(this.installed, this.catalog, this.platform);
    if (!Object.keys(this.usage.apps).length) this.seedUsage();
    this.seedRunning();
  }

  private static read(): Stored {
    try {
      const text = window.localStorage.getItem(STORE);
      return text ? (JSON.parse(text) as Stored) : {};
    } catch {
      return {};
    }
  }

  save(): void {
    try {
      const data: Stored = { prefs: this.prefs, usage: this.usage, platform: this.platform, clock: this.offset };
      if (this.custom && this.installed) {
        data.installed = this.installed;
        if (this.catalog) data.catalog = this.catalog;
      }
      window.localStorage.setItem(STORE, JSON.stringify(data));
    } catch {
      return;
    }
  }

  wipe(): void {
    try {
      window.localStorage.removeItem(STORE);
    } catch {
      return;
    }
  }

  static cleanPrefs(raw: unknown): Prefs | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const base = defaultPrefs();
    const strings = (v: unknown, fallback: string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : fallback);
    const widgets = Array.isArray(r.widgets)
      ? (r.widgets as Record<string, unknown>[])
          .filter((t) => t && typeof t === "object")
          .map((t): Tile => {
            const kind = t.kind === "group" || t.kind === "updates" ? t.kind : "app";
            const size = t.size === "s" || t.size === "l" ? t.size : "m";
            return { kind, id: String(t.id ?? t.app ?? ""), app: String(t.app ?? ""), name: String(t.name ?? ""), apps: strings(t.apps, []), size };
          })
          .filter((t) => t.id)
      : base.widgets;
    const hotkeys: Record<string, string> = {};
    if (r.hotkeys && typeof r.hotkeys === "object") {
      for (const [k, v] of Object.entries(r.hotkeys as Record<string, unknown>)) {
        if ((ACTIONS as readonly string[]).includes(k) && typeof v === "string") hotkeys[k] = v;
      }
    }
    const view = typeof r.default_view === "string" && (VIEW_IDS as string[]).includes(r.default_view) ? (r.default_view as View) : base.default_view;
    return {
      default_view: view,
      open_at_login: Boolean(r.open_at_login),
      hidden: strings(r.hidden, base.hidden),
      pinned: strings(r.pinned, base.pinned),
      locations: strings(r.locations, base.locations),
      widgets,
      hotkeys,
    };
  }

  subscribe(fn: Listener): void {
    this.listeners.push(fn);
  }

  emit(name: string, payload: unknown): void {
    for (const fn of this.listeners) fn(name, payload);
  }

  now(): number {
    return Math.floor(Date.now() / 1000) + this.offset;
  }

  private useSample(): void {
    const s = this.sample();
    this.installed = s.installed;
    this.catalog = s.catalog;
    this.custom = false;
  }

  private seedUsage(): void {
    const board = ["formvis", "formcut", "formwav", "formdeck", "formlit", "formmd", "formvfx", "formpdf"];
    const now = this.now();
    board.forEach((id, i) => {
      this.usage.apps[id] = { count: 9 - i, last: now - 900 * (i + 1) };
    });
  }

  private seedRunning(): void {
    const now = this.now();
    ["formvis", "formcut", "formwav"].forEach((id, i) => {
      if (this.portal.installs.some((x) => x.id === id)) this.running.set(id, now - 600 * (i + 1));
    });
  }

  private isReleased(app: Entry): boolean {
    if (app.id === "formtray") return false;
    const at = opensUnix(app.opens);
    return (at !== null && at <= this.now()) || this.portal.released.has(app.id);
  }

  private pathOf(id: string): string | null {
    return this.portal.installs.find((x) => x.id === id)?.path ?? null;
  }

  hotkeys(): Record<string, string> {
    const map = { ...DEFAULTS[this.platform] };
    for (const [action, chord] of Object.entries(this.prefs.hotkeys)) {
      if ((ACTIONS as readonly string[]).includes(action) && !this.conflict(chord)) map[action] = chord;
    }
    return map;
  }

  conflict(chord: string): string | null {
    const wanted = normalise(chord).toLowerCase();
    return RESERVED[this.platform].find(([c]) => normalise(c).toLowerCase() === wanted)?.[1] ?? null;
  }

  displayName(app: Entry): [string, "app" | "portal" | "registry"] {
    const portal = this.portal.names.get(app.id);
    const name = portal ? formName(app, portal) : null;
    return name ? [name, "portal"] : [app.name, "registry"];
  }

  snapshot(): Snapshot {
    const apps: AppState[] = registry.apps
      .filter((a) => this.isReleased(a))
      .map((a) => {
        const since = this.running.get(a.id);
        const used = this.usage.apps[a.id];
        const path = this.pathOf(a.id);
        const [name, source] = this.displayName(a);
        return {
          id: a.id,
          name,
          alt_of: a.alt_of,
          category: a.category,
          hue: a.hue,
          icon: a.icon,
          live_icon: "",
          name_source: source,
          installed: path !== null || since !== undefined,
          path,
          running: since !== undefined,
          processes: since !== undefined ? 1 : 0,
          since: since ?? 0,
          count: used?.count ?? 0,
          last: used?.last ?? 0,
          hidden: this.prefs.hidden.includes(a.id),
        };
      });
    const last = VIEW_IDS.includes(this.usage.last_view as View) ? this.usage.last_view : this.prefs.default_view;
    return {
      categories: registry.categories,
      apps,
      prefs: this.prefs,
      hotkeys: this.hotkeys(),
      platform: this.platform,
      portal: this.portal.found,
      updates: this.portal.updates,
      last_view: last,
    };
  }

  private entry(id: string): Entry {
    const e = lookup(id);
    if (!e || !this.isReleased(e)) throw new Error(`${id} is not installed on this computer`);
    return e;
  }

  open(id: string): string {
    const app = this.entry(id);
    const was = this.running.has(app.id);
    if (!was && this.pathOf(app.id) === null) throw new Error(`${app.name} is not installed on this computer`);
    if (!was) this.running.set(app.id, this.now());
    const used = this.usage.apps[app.id] ?? { count: 0, last: 0 };
    used.count += 1;
    used.last = this.now();
    this.usage.apps[app.id] = used;
    this.save();
    this.push();
    return app.id;
  }

  quit(id: string): void {
    const app = this.entry(id);
    if (!this.running.has(app.id)) throw new Error(`${app.name} is not running`);
    this.running.delete(app.id);
    this.push();
  }

  setPrefs(prefs: Prefs): Snapshot {
    this.prefs = prefs;
    this.save();
    this.push();
    return this.snapshot();
  }

  setHotkey(action: string, chord: string): Snapshot {
    if (!(ACTIONS as readonly string[]).includes(action)) throw new Error(`${action} is not a FormTray action`);
    const prefs: Prefs = { ...this.prefs, hotkeys: { ...this.prefs.hotkeys } };
    if (!chord.trim()) {
      delete prefs.hotkeys[action];
    } else {
      const wanted = normalise(chord);
      const owner = this.conflict(wanted);
      if (owner) throw new Error(`${wanted} is used by ${owner}`);
      const taken = Object.entries(this.hotkeys()).find(([a, c]) => a !== action && normalise(c).toLowerCase() === wanted.toLowerCase());
      if (taken) throw new Error(`${wanted} is already FormTray's ${taken[0]} hotkey`);
      prefs.hotkeys[action] = wanted;
    }
    return this.setPrefs(prefs);
  }

  noteView(view: string): void {
    if (VIEW_IDS.includes(view as View) && this.usage.last_view !== view) {
      this.usage.last_view = view;
      this.save();
    }
  }

  setPlatform(platform: Platform): void {
    this.platform = platform;
    if (!this.custom) this.useSample();
    this.reread();
  }

  setClock(unix: number | null): void {
    const real = Math.floor(Date.now() / 1000);
    this.offset = unix === null ? 0 : unix - real;
    this.reread();
  }

  private reread(): void {
    this.portal = readPortal(this.installed, this.catalog, this.platform);
    for (const id of [...this.running.keys()]) {
      if (!this.portal.installs.some((x) => x.id === id)) this.running.delete(id);
    }
    this.save();
    this.push();
  }

  rescan(): { found: number; total: number } {
    this.reread();
    const apps = this.snapshot().apps;
    return { found: apps.filter((a) => a.installed).length, total: apps.length };
  }

  importPortal(installed: InstalledDoc | null, catalog: CatalogDoc | null): void {
    if (installed) this.installed = installed;
    if (catalog) this.catalog = catalog;
    if (!this.installed) this.installed = { installs: [] };
    this.custom = true;
    this.reread();
  }

  useBuiltInSample(): void {
    this.useSample();
    this.reread();
  }

  sampleDocs(): { installed: InstalledDoc; catalog: CatalogDoc } {
    return this.sample();
  }

  reset(): void {
    this.wipe();
    this.prefs = defaultPrefs();
    this.usage = { apps: {}, last_view: "" };
    this.running.clear();
    this.offset = 0;
    this.useSample();
    this.portal = readPortal(this.installed, this.catalog, this.platform);
    this.seedUsage();
    this.seedRunning();
    this.push();
  }

  exportPrefs(): string {
    return JSON.stringify({ ...this.prefs, layout: 2, locations: this.prefs.locations }, null, 2);
  }

  portalSummary(): string {
    if (!this.portal.found) return "No install record. Every app shows as not installed.";
    const source = this.custom ? "Your files" : "Built-in sample";
    const n = this.portal.installs.length;
    const u = this.portal.updates.length;
    return `${source}: ${n} install${n === 1 ? "" : "s"}, ${u} update${u === 1 ? "" : "s"} seen.`;
  }

  private sig = "";

  appSignature(): string {
    return this.snapshot()
      .apps.map((a) => a.id)
      .join(",");
  }

  markSignature(): void {
    this.sig = this.appSignature();
  }

  appsChanged(): boolean {
    return this.sig !== this.appSignature();
  }

  push(): void {
    this.emit("state", this.snapshot());
  }
}

export function resolveApp(target: string): { id: string; name: string } | null {
  const e = lookup(target);
  return e ? { id: e.id, name: e.name } : null;
}
