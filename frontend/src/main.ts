import { call, native, on, VIEWS, type Prefs, type ShellInfo, type Snapshot, type View } from "./bridge";
import { createExtensions, loadListing, type Listing } from "./ext/host";
import { syncIdentity } from "./ui";
import { apps } from "./views/apps";
import { prefsView } from "./views/prefs";
import { stack } from "./views/stack";
import { switcher } from "./views/switcher";
import type { Ctx, ViewModule } from "./views/types";
import { widgets } from "./views/widgets";
import { windowsView } from "./views/windows";

const params = new URLSearchParams(location.search);
const requested = params.get("view") as View | null;
const view = (requested ?? "widgets") as View;
const root = document.getElementById("panel") as HTMLElement;
const toastBox = document.getElementById("toast") as HTMLElement;
document.documentElement.dataset.native = String(native);
if (requested) document.documentElement.dataset.view = requested;

const factories: Record<View, () => ViewModule> = { switcher, stack, apps, windows: windowsView, widgets, prefs: prefsView };
const panelMode = view !== "prefs";
const panes = new Map<View, { module: ViewModule; pane: HTMLElement }>();
let active: View = view;
let holding = false;
for (const v of panelMode ? VIEWS : [view]) {
  const pane = panelMode ? document.createElement("section") : root;
  if (panelMode) {
    pane.className = "pane";
    pane.dataset.pane = v;
    pane.hidden = !requested || v !== active;
    root.append(pane);
  }
  panes.set(v, { module: factories[v](), pane });
}
const current = () => panes.get(active)!.module;

function afterPaint(cb: () => void) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    cb();
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
  window.setTimeout(run, 60);
}

function activate(next: View, reason: string) {
  const target = panes.get(next);
  if (!target) return;
  holding = next === "switcher" && reason === "switcher";
  if (next !== active) {
    panes.get(active)!.pane.hidden = true;
    target.pane.hidden = false;
    active = next;
    document.documentElement.dataset.view = next;
    onView(next);
  }
  target.module.shown(reason);
}

let onView: (v: View) => void = () => undefined;

let toastTimer = 0;
function toast(message: string) {
  toastBox.textContent = message;
  toastBox.classList.add("is-on");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastBox.classList.remove("is-on"), 3200);
}

async function start() {
  const none: Listing = { product: "formtray", app: "FormTray", appVersion: "", stamp: [0, 0], extensions: [] };
  const [snap, info, listing] = await Promise.all([call<Snapshot>("snapshot"), call<ShellInfo>("shell_info"), panelMode ? loadListing() : Promise.resolve(none)]);
  document.documentElement.dataset.glass = info.glass;
  document.documentElement.dataset.platform = snap.platform;
  syncIdentity(snap);

  if (!requested) {
    const first = (VIEWS as readonly string[]).includes(snap.last_view) && panes.has(snap.last_view as View) ? (snap.last_view as View) : "widgets";
    active = first;
    document.documentElement.dataset.view = first;
    panes.get(first)!.pane.hidden = false;
  }

  const ctx: Ctx = {
    snap,
    open(id) {
      return call("open_app", { id }).then(
        () => true,
        (e) => {
          toast(String(e));
          return false;
        },
      );
    },
    async quit(id) {
      await call("quit_app", { id }).catch((e) => toast(String(e)));
    },
    go(target) {
      if (target === active && panelMode) return;
      if (target === "prefs" || !panelMode) {
        if (native) call("show", { view: target });
        else location.search = `?view=${target}`;
      } else if (native) {
        call("show", { view: target });
      } else {
        activate(target, "switch");
      }
    },
    dismiss() {
      if (native) call("dismiss");
    },
    toast,
    async savePrefs(prefs: Prefs) {
      try {
        const next = await call<Snapshot>("set_prefs", { prefs });
        ctx.snap = next;
      } catch (e) {
        toast(String(e));
      }
    },
    updates() {
      call("updates").catch((e) => toast(String(e)));
    },
  };

  if (panelMode) {
    const layer = document.createElement("div");
    layer.className = "ext-layer";
    root.append(layer);
    ctx.ext = createExtensions(
      layer,
      {
        snap: () => ctx.snap,
        view: () => active,
        go: (v) => ctx.go(v),
        open: (id) => ctx.open(id),
        quit: (id) => ctx.quit(id),
        rescan: () => {
          call("rescan").catch((e) => toast(String(e)));
        },
        updates: () => ctx.updates(),
        async savePrefs(prefs) {
          await ctx.savePrefs(prefs);
          for (const { module } of panes.values()) module.update(ctx.snap);
          ctx.ext?.observe(ctx.snap);
        },
        toast,
        show: () => {
          if (native) call("show", { view: active }).catch(() => undefined);
        },
      },
      listing,
    );
    onView = (v) => ctx.ext?.viewChanged(v);
  }

  for (const { module, pane } of panes.values()) module.mount(pane, ctx);

  await on<Snapshot>("state", (next) => {
    ctx.snap = next;
    for (const { module } of panes.values()) module.update(next);
    syncIdentity(next);
    ctx.ext?.observe(next);
  });
  await on<string>("view:shown", (reason) => current().shown(reason));
  await on<{ view: View; reason: string; moving: boolean }>("view:show", (p) => {
    if (!p.moving) return activate(p.view, p.reason);
    document.documentElement.classList.add("is-moving");
    activate(p.view, p.reason);
    afterPaint(() => call("settle", { view: p.view }));
  });
  await on<string>("view:placed", () => afterPaint(() => afterPaint(() => document.documentElement.classList.remove("is-moving"))));
  if (native && panelMode && requested) {
    const now = await call<View | null>("current_view");
    if (now && now !== active) activate(now, "launch");
  }
  await on<number>("switcher:step", (by) => panes.get("switcher")?.module.step?.(by));
  await on<null>("switcher:commit", () => panes.get("switcher")?.module.commit?.());
  await on<string>("notice", (message) => toast(message));

  window.addEventListener("keydown", (e) => {
    if (current().key?.(e)) {
      e.preventDefault();
      return;
    }
    const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
    if (e.key === "Escape") {
      ctx.dismiss();
      e.preventDefault();
    } else if ((e.metaKey || e.ctrlKey) && e.key === ",") {
      ctx.go("prefs");
      e.preventDefault();
    } else if (!typing && view !== "prefs" && /^[1-5]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      ctx.go(VIEWS[Number(e.key) - 1]);
      e.preventDefault();
    }
  });

  if (panelMode && snap.platform === "linux") {
    window.addEventListener("keyup", (e) => {
      if (active === "switcher" && holding && (e.key === "Alt" || e.key === "Meta" || e.key === "Control")) panes.get("switcher")?.module.commit?.();
    });
  }

  if (!native) current().shown(active === "switcher" ? "switcher" : "preview");
  document.documentElement.classList.add("is-ready");
  if (native && panelMode) afterPaint(() => call("app_ready").catch(() => undefined));
}

start().catch((e) => toast(String(e)));
