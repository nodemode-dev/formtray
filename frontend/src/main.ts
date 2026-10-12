import { call, native, on, VIEWS, type Prefs, type ShellInfo, type Snapshot, type View } from "./bridge";
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
const module = factories[view]();

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

  const ctx: Ctx = {
    snap,
    open(id) {
      call("open_app", { id }).catch((e) => toast(String(e)));
    },
    async quit(id) {
      await call("quit_app", { id }).catch((e) => toast(String(e)));
    },
    go(target) {
      if (target === view) return;
      if (native) call("show", { view: target });
      else location.search = `?view=${target}`;
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

  module.mount(root, ctx);

  await on<Snapshot>("state", (next) => {
    ctx.snap = next;
    module.update(next);
  });
  await on<string>("view:shown", (reason) => module.shown(reason));
  await on<number>("switcher:step", (by) => module.step?.(by));
  await on<null>("switcher:commit", () => module.commit?.());
  await on<string>("notice", (message) => toast(message));

  window.addEventListener("keydown", (e) => {
    if (module.key?.(e)) {
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

  if (view === "switcher") {
    window.addEventListener("keyup", (e) => {
      const linux = snap.platform === "linux";
      if (linux && (e.key === "Alt" || e.key === "Meta" || e.key === "Control")) module.commit?.();
    });
  }

  if (!native) module.shown(view === "switcher" ? "switcher" : "preview");
  document.documentElement.classList.add("is-ready");
}

start().catch((e) => toast(String(e)));
