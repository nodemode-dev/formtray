import { call, engine, on, onUiLog, VIEWS, type Prefs, type ShellInfo, type Snapshot, type View } from "./bridge";
import { icons } from "../../frontend/src/icons";
import { syncIdentity } from "../../frontend/src/ui";
import { apps } from "../../frontend/src/views/apps";
import { prefsView } from "../../frontend/src/views/prefs";
import { stack } from "../../frontend/src/views/stack";
import { switcher } from "../../frontend/src/views/switcher";
import type { Ctx, ViewModule } from "../../frontend/src/views/types";
import { widgets } from "../../frontend/src/views/widgets";
import { windowsView } from "../../frontend/src/views/windows";
import { mountConsole } from "./console";
import { mountDesktop } from "./desktop";
import { download, readFiles } from "./files";
import { normalise, type Platform } from "./engine";

type Pane = View | "prefs";
const ALL: Pane[] = [...VIEWS, "prefs"];
const factories: Record<Pane, () => ViewModule> = { switcher, stack, apps, windows: windowsView, widgets, prefs: prefsView };
const SIZES: Record<Pane, [number, number]> = { switcher: [1048, 196], stack: [420, 452], apps: [920, 660], windows: [920, 660], widgets: [920, 660], prefs: [640, 600] };
const LABELS: Record<Pane, string> = { switcher: "Switcher", stack: "Stack", apps: "Apps", windows: "Windows", widgets: "Widgets", prefs: "Settings" };
const GLYPHS: Record<Pane, string> = { switcher: icons.viewSwitcher, stack: icons.viewStack, apps: icons.viewApps, windows: icons.viewWindows, widgets: icons.viewWidgets, prefs: icons.gear };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const html = document.documentElement;
const root = $("panel");
const stage = $("stage");
const fit = $("fit");
const toastBox = $("toast");

let active: Pane = "widgets";
let before: Pane = "widgets";
let ctx: Ctx;
let panes = new Map<Pane, { module: ViewModule; pane: HTMLElement }>();
const tabs = new Map<Pane, HTMLButtonElement>();

let toastTimer = 0;
function toast(message: string) {
  toastBox.textContent = message;
  toastBox.classList.add("is-on");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastBox.classList.remove("is-on"), 3200);
}

function refit() {
  const [w, h] = SIZES[active];
  const s = Math.min(0.9, (stage.clientWidth - 32) / w, (stage.clientHeight - 32) / h);
  fit.style.setProperty("--fit", String(Math.max(0.3, s)));
}

function activate(next: Pane, reason: string) {
  const target = panes.get(next);
  if (!target) return;
  if (next !== active) {
    if (next === "prefs") before = active;
    panes.get(active)!.pane.hidden = true;
    target.pane.hidden = false;
    active = next;
    html.dataset.view = next;
    tabs.forEach((b, id) => (id === next ? b.setAttribute("aria-current", "true") : b.removeAttribute("aria-current")));
    if (next !== "prefs") engine.noteView(next);
    refit();
  }
  target.module.shown(reason);
}

function build(snap: Snapshot) {
  panes = new Map();
  root.replaceChildren();
  for (const v of ALL) {
    const pane = document.createElement("section");
    pane.className = "pane";
    pane.dataset.pane = v;
    pane.hidden = v !== active;
    root.append(pane);
    panes.set(v, { module: factories[v](), pane });
  }
  syncIdentity(snap);
  ctx.snap = snap;
  for (const { module, pane } of panes.values()) module.mount(pane, ctx);
  engine.markSignature();
}

function current(): ViewModule {
  return panes.get(active)!.module;
}

function chordOf(e: KeyboardEvent): string {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Control");
  if (e.shiftKey) mods.push("Shift");
  if (e.altKey) mods.push("Alt");
  if (e.metaKey) mods.push("Super");
  return [...mods, e.code].join("+");
}

function hotkeyTarget(e: KeyboardEvent): { pane: Pane; reason: string } | null {
  if (e.code.startsWith("Shift") || e.code.startsWith("Control") || e.code.startsWith("Alt") || e.code.startsWith("Meta")) return null;
  if (!e.ctrlKey && !e.altKey && !e.metaKey) return null;
  const chord = normalise(chordOf(e)).toLowerCase();
  for (const [action, bound] of Object.entries(engine.hotkeys())) {
    if (normalise(bound).toLowerCase() !== chord) continue;
    if (action === "switcher") return { pane: "switcher", reason: "switcher" };
    if (action === "summon") return { pane: (engine.snapshot().last_view as Pane) || "widgets", reason: "summon" };
    return { pane: action.replace("view-", "") as Pane, reason: "hotkey" };
  }
  return null;
}

async function start() {
  const [snap, info] = await Promise.all([call<Snapshot>("snapshot"), call<ShellInfo>("shell_info")]);
  html.dataset.glass = info.glass;
  html.dataset.platform = snap.platform;
  const asked = new URLSearchParams(location.search).get("view") as Pane | null;
  active = asked && ALL.includes(asked) ? asked : (ALL.includes(snap.last_view as Pane) ? (snap.last_view as Pane) : "widgets");
  before = active === "prefs" ? "widgets" : active;
  html.dataset.view = active;

  const nav = $("demo-views");
  for (const v of ALL) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "demo-tab";
    b.innerHTML = `${GLYPHS[v]}<span>${LABELS[v]}</span>`;
    b.title = LABELS[v];
    if (v === active) b.setAttribute("aria-current", "true");
    b.addEventListener("click", () => activate(v, "switch"));
    nav.append(b);
    tabs.set(v, b);
  }

  const cl = mountConsole($("cl-log"), $("cl-form") as HTMLFormElement, $("cl-input") as HTMLInputElement, $("cl-chips"));
  onUiLog((line) => cl.print(`window: ${line}`, "ui"));
  cl.print("FormTray's engine ported to the browser. Try: list, open formpdf, hotkeys.\nThe window on the left logs what you do in it here.", "ui");

  ctx = {
    snap,
    open(id) {
      call("open_app", { id }).catch((e) => toast(String(e)));
    },
    async quit(id) {
      await call("quit_app", { id }).catch((e) => toast(String(e)));
    },
    go(target) {
      activate(target, "switch");
    },
    dismiss() {
      if (active === "prefs") activate(before, "switch");
    },
    toast,
    async savePrefs(prefs: Prefs) {
      try {
        ctx.snap = await call<Snapshot>("set_prefs", { prefs });
      } catch (e) {
        toast(String(e));
      }
    },
    updates() {
      call("updates").catch((e) => toast(String(e)));
    },
  };

  build(snap);
  refit();
  new ResizeObserver(refit).observe(stage);

  const desktop = mountDesktop($("desktop"), (id) => ctx.open(id));
  desktop.sync(snap, engine.now());

  const portalStatus = $("portal-status");
  const syncStatus = () => {
    const text = engine.portalSummary();
    if (portalStatus.textContent !== text) portalStatus.textContent = text;
  };
  syncStatus();

  await on<Snapshot>("state", (next) => {
    if (engine.appsChanged()) {
      build(next);
      activate(active, "reload");
    } else {
      ctx.snap = next;
      for (const { module } of panes.values()) module.update(next);
      syncIdentity(next);
    }
    html.dataset.platform = next.platform;
    desktop.sync(next, engine.now());
    syncStatus();
  });
  await on<string>("notice", (message) => toast(message));

  window.addEventListener("keydown", (e) => {
    if ((e.target as Element | null)?.closest?.("[data-demo-ui]")) return;
    if (current().key?.(e)) {
      e.preventDefault();
      return;
    }
    const hit = hotkeyTarget(e);
    if (hit && panes.has(hit.pane)) {
      activate(hit.pane, hit.reason);
      e.preventDefault();
      return;
    }
    const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
    if (e.key === "Escape") {
      ctx.dismiss();
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && e.key === ",") {
      activate("prefs", "switch");
      e.preventDefault();
    } else if (!typing && active !== "prefs" && /^[1-5]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      activate(VIEWS[Number(e.key) - 1], "switch");
      e.preventDefault();
    }
  });

  const platform = $<HTMLSelectElement>("opt-platform");
  platform.value = snap.platform;
  platform.addEventListener("change", () => engine.setPlatform(platform.value as Platform));

  const theme = $<HTMLSelectElement>("opt-theme");
  theme.value = html.dataset.theme ?? "dark";
  theme.addEventListener("change", () => {
    html.dataset.theme = theme.value;
    try {
      window.localStorage.setItem("formtray-demo-theme", theme.value);
    } catch {
      return;
    }
  });

  const date = $<HTMLInputElement>("opt-date");
  const showDate = () => {
    const d = new Date((engine.now() + 0) * 1000);
    date.value = d.toISOString().slice(0, 10);
  };
  showDate();
  date.addEventListener("change", () => {
    const t = Date.parse(`${date.value}T17:00:00Z`);
    if (Number.isNaN(t)) return;
    engine.setClock(Math.floor(t / 1000));
  });

  const file = $<HTMLInputElement>("file");
  const ingest = async (files: File[]) => {
    const r = await readFiles(files);
    toast(r.message);
    cl.print(r.message, r.ok ? "ui" : "err");
    showDate();
  };
  $("pick").addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    const list = [...(file.files ?? [])];
    file.value = "";
    if (list.length) void ingest(list);
  });
  $("use-sample").addEventListener("click", () => {
    engine.useBuiltInSample();
    toast("Using the built-in sample install record.");
  });
  $("dl-installed").addEventListener("click", () => download("installed.json", JSON.stringify(engine.sampleDocs().installed, null, 2)));
  $("dl-catalog").addEventListener("click", () => download("apps.json", JSON.stringify(engine.sampleDocs().catalog, null, 2)));
  $("export").addEventListener("click", () => download("prefs.json", engine.exportPrefs()));
  $("reset").addEventListener("click", () => {
    engine.reset();
    showDate();
    toast("Demo reset.");
  });

  const drop = $("drop");
  let depth = 0;
  window.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    depth++;
    drop.hidden = false;
  });
  window.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (!depth) drop.hidden = true;
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    depth = 0;
    drop.hidden = true;
    const list = [...(e.dataTransfer?.files ?? [])];
    if (list.length) void ingest(list);
  });

  activate(active, "preview");
  html.classList.add("is-ready");
}

start().catch((e) => toast(String(e)));
