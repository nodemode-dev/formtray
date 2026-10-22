import { call, native, on, VIEWS, type Prefs, type ShellInfo, type Snapshot, type View } from "./bridge";
import { syncIdentity } from "./ui";
import { apps } from "./views/apps";
import { prefsView } from "./views/prefs";
import { stack } from "./views/stack";
import { switcher } from "./views/switcher";
import type { Ctx, ViewModule } from "./views/types";
import { widgets } from "./views/widgets";
import { windowsView } from "./views/windows";

const params = new URLSearchParams(location.search);
const view = (params.get("view") ?? "apps") as View;
const root = document.getElementById("panel") as HTMLElement;
const toastBox = document.getElementById("toast") as HTMLElement;
document.documentElement.dataset.view = view;
document.documentElement.dataset.native = String(native);

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
    pane.hidden = v !== active;
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
  }
  target.module.shown(reason);
}

let toastTimer = 0;
function toast(message: string) {
  toastBox.textContent = message;
  toastBox.classList.add("is-on");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastBox.classList.remove("is-on"), 3200);
}

async function start() {
  const [snap, info] = await Promise.all([call<Snapshot>("snapshot"), call<ShellInfo>("shell_info")]);
  document.documentElement.dataset.glass = info.glass;
  document.documentElement.dataset.platform = snap.platform;
  syncIdentity(snap);

  const ctx: Ctx = {
    snap,
    open(id) {
      call("open_app", { id }).catch((e) => toast(String(e)));
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

  for (const { module, pane } of panes.values()) module.mount(pane, ctx);

  await on<Snapshot>("state", (next) => {
    ctx.snap = next;
    for (const { module } of panes.values()) module.update(next);
    syncIdentity(next);
  });
  await on<string>("view:shown", (reason) => current().shown(reason));
  await on<{ view: View; reason: string; moving: boolean }>("view:show", (p) => {
    if (!p.moving) return activate(p.view, p.reason);
    document.documentElement.classList.add("is-moving");
    activate(p.view, p.reason);
    afterPaint(() => call("settle", { view: p.view }));
  });
  await on<string>("view:placed", () => afterPaint(() => afterPaint(() => document.documentElement.classList.remove("is-moving"))));
  if (native && panelMode) {
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

  if (!native) current().shown(view === "switcher" ? "switcher" : "preview");
  document.documentElement.classList.add("is-ready");
}

start().catch((e) => toast(String(e)));
