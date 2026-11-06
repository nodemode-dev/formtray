import { native, VIEWS, call, type AppState, type Prefs, type ShellInfo, type Snapshot, type View } from "../bridge";
import { icons } from "../icons";
import { appIcon, appName, el, iconButton, prettyChord } from "../ui";
import type { Ctx, ViewModule } from "./types";

const ACTION_NAMES: Record<string, string> = {
  switcher: "Switcher (hold, then tap)",
  summon: "Show the last view",
  "view-switcher": "Switcher view",
  "view-stack": "Stack view",
  "view-apps": "Apps view",
  "view-windows": "Windows view",
  "view-widgets": "Widgets view",
};

const VIEW_LABELS: Partial<Record<View, string>> = {
  widgets: "Widgets",
  apps: "Apps",
  switcher: "Switcher",
  stack: "Stack",
  windows: "Windows",
};

export function prefsView(): ViewModule {
  let ctx: Ctx;
  let defaultView: HTMLSelectElement;
  let login: HTMLInputElement;
  let locations: HTMLTextAreaElement;
  let keys: HTMLElement;
  let about: HTMLElement;
  let appList: HTMLElement;
  let capturing: string | null = null;
  let keySignature = "";
  const rows = new Map<string, { row: HTMLElement; show: HTMLInputElement; pin: HTMLInputElement; where: HTMLElement }>();

  function draft(): Prefs {
    const p = ctx.snap.prefs;
    const hidden = [...rows].filter(([, r]) => !r.show.checked).map(([id]) => id);
    const pinnedNow = [...rows].filter(([, r]) => r.pin.checked).map(([id]) => id);
    const pinned = [...p.pinned.filter((id) => pinnedNow.includes(id)), ...pinnedNow.filter((id) => !p.pinned.includes(id))];
    return {
      ...p,
      default_view: defaultView.value as View,
      open_at_login: login.checked,
      hidden,
      pinned,
      locations: locations.value.split("\n").map((s) => s.trim()).filter(Boolean),
    };
  }

  const save = () => ctx.savePrefs(draft());

  function section(title: string, ...children: Node[]): HTMLElement {
    const s = el("section", "pf-section");
    s.append(el("h2", "pf-h", title), ...children);
    return s;
  }

  function field(label: string, control: HTMLElement, hint = ""): HTMLElement {
    const f = el("label", "pf-field");
    const text = el("span", "pf-label", label);
    f.append(text, control);
    if (hint) f.append(el("span", "pf-hint", hint));
    return f;
  }

  function capture(action: string, button: HTMLButtonElement) {
    capturing = action;
    button.textContent = "Press the new keys, or Esc";
    button.classList.add("is-capturing");
    void call("pause_hotkeys", { paused: true });
  }

  function finishCapture() {
    capturing = null;
    keySignature = "";
    void call("pause_hotkeys", { paused: false });
    void renderKeys(ctx.snap);
  }

  function onCapture(e: KeyboardEvent) {
    if (!capturing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === "Escape") return finishCapture();
    if (["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"].includes(e.key)) return;
    const mods: string[] = [];
    if (e.ctrlKey) mods.push("Control");
    if (e.shiftKey) mods.push("Shift");
    if (e.altKey) mods.push("Alt");
    if (e.metaKey) mods.push("Super");
    if (!mods.some((m) => m !== "Shift")) {
      ctx.toast(ctx.snap.platform === "macos" ? "Hold Control, Option or Command with the key." : "Hold Ctrl, Alt or the Windows key with the key.");
      return;
    }
    const action = capturing;
    const chord = [...mods, e.code].join("+");
    capturing = null;
    call<Snapshot>("set_hotkey", { action, chord })
      .then((next) => {
        ctx.snap = next;
      })
      .catch((err) => ctx.toast(String(err)))
      .finally(finishCapture);
  }

  async function renderKeys(snap: Snapshot) {
    const info = await call<ShellInfo>("shell_info");
    const signature = JSON.stringify([snap.hotkeys, snap.prefs.hotkeys, info.issues, capturing]);
    if (signature === keySignature) return;
    keySignature = signature;
    keys.replaceChildren();
    for (const action of Object.keys(ACTION_NAMES)) {
      const chord = snap.hotkeys[action];
      if (!chord) continue;
      const row = el("div", "pf-key");
      const change = el("button", "pf-kbd pf-kbd-btn", prettyChord(chord, snap.platform));
      change.type = "button";
      change.title = "Change this hotkey";
      change.addEventListener("click", () => capture(action, change));
      const acts = el("span", "pf-key-acts");
      acts.append(change);
      if (snap.prefs.hotkeys[action]) {
        const reset = el("button", "pf-reset", "Default");
        reset.type = "button";
        reset.addEventListener("click", () => {
          call<Snapshot>("set_hotkey", { action, chord: "" })
            .then((next) => {
              ctx.snap = next;
              keySignature = "";
              void renderKeys(next);
            })
            .catch((err) => ctx.toast(String(err)));
        });
        acts.append(reset);
      }
      row.append(el("span", "pf-key-name", ACTION_NAMES[action]), acts);
      keys.append(row);
    }
    for (const issue of info.issues) {
      keys.append(el("p", "pf-warn", `${ACTION_NAMES[issue.action] ?? issue.action}: ${prettyChord(issue.chord, snap.platform)} could not be registered (${issue.reason}).`));
    }
    if (info.wayland) {
      keys.append(el("p", "pf-hint", "Wayland has no global hotkeys for apps. Bind these commands in your desktop's keyboard settings: formtray --view apps, formtray --view switcher, formtray --view stack, formtray --view windows, formtray --view widgets."));
    }
    about.textContent = `FormTray ${info.version} · ${info.glass === "liquid" ? "Glass" : info.glass === "vibrancy" ? "macOS vibrancy" : info.glass === "acrylic" ? "Windows acrylic" : "solid panels"} · ${native ? snap.platform : "browser preview"}`;
  }

  function buildRow(app: AppState) {
    const row = el("div", "pf-app");
    const show = el("input", "switch");
    show.type = "checkbox";
    show.addEventListener("change", save);
    const pin = el("input", "switch");
    pin.type = "checkbox";
    pin.addEventListener("change", save);
    const where = el("span", "pf-where");
    const name = el("span", "pf-app-name");
    name.append(appName("strong", "", app), where);
    row.append(appIcon(app, "s"), name, show, pin);
    rows.set(app.id, { row, show, pin, where });
    appList.append(row);
    return rows.get(app.id)!;
  }

  function syncRows(snap: Snapshot) {
    const apps = snap.apps.filter((a) => a.id !== "formtray");
    const live = new Set(apps.map((a) => a.id));
    for (const [id, r] of rows) {
      if (live.has(id)) continue;
      r.row.remove();
      rows.delete(id);
    }
    for (const app of apps) {
      const r = rows.get(app.id) ?? buildRow(app);
      r.show.setAttribute("aria-label", `Show ${app.name}`);
      r.pin.setAttribute("aria-label", `${app.name} in menu bar`);
      if (document.activeElement !== r.show) r.show.checked = !app.hidden;
      if (document.activeElement !== r.pin) r.pin.checked = snap.prefs.pinned.includes(app.id);
      const where = app.running ? "Open now" : app.installed ? (app.path ?? "Installed") : "Not found on this computer";
      if (r.where.textContent !== where) r.where.textContent = where;
      r.row.classList.toggle("is-missing", !app.installed);
    }
    let prev: Element = appList.firstElementChild as Element;
    for (const app of apps) {
      const r = rows.get(app.id)!;
      if (prev.nextElementSibling !== r.row) prev.after(r.row);
      prev = r.row;
    }
  }

  return {
    mount(root, c) {
      ctx = c;
      root.classList.add("v-prefs");
      const head = el("header", "pn-head");
      head.setAttribute("data-tauri-drag-region", "");
      head.append(el("h1", "pn-title", "FormTray Settings"), iconButton(icons.close, "Close", () => ctx.dismiss(), "pf-close"));

      defaultView = el("select", "pf-select");
      const ordered = ["widgets", ...VIEWS.filter((v) => v !== "widgets")] as View[];
      for (const v of ordered) {
        const o = el("option", "", VIEW_LABELS[v] ?? v);
        o.value = v;
        defaultView.append(o);
      }
      defaultView.addEventListener("change", save);
      login = el("input", "switch");
      login.type = "checkbox";
      login.addEventListener("change", save);

      const list = el("div", "pf-apps");
      appList = list;
      const legend = el("div", "pf-app pf-legend");
      legend.append(el("span", "", ""), el("span", "", "App"), el("span", "", "Show"), el("span", "", "In menu bar"));
      list.append(legend);

      locations = el("textarea", "pf-text");
      locations.rows = 3;
      locations.placeholder = "One folder per line, for apps kept outside the usual places";
      locations.addEventListener("change", save);
      const rescan = el("button", "btn", "Find apps again");
      rescan.type = "button";
      rescan.addEventListener("click", () => call("rescan"));
      const updates = el("button", "btn", "Check for updates in FormPortal");
      updates.type = "button";
      updates.addEventListener("click", () => ctx.updates());

      keys = el("div", "pf-keys");
      about = el("p", "pf-hint");
      const credit = el("p", "pf-hint", "Copyright 2026 NodeAgentc, Inc. Apache License 2.0; the LICENSE file is beside the app.");
      credit.translate = false;

      const body = el("div", "pf-body");
      body.append(
        section("General", field("Opens with", defaultView, "The view FormTray shows when it starts."), field("Open at login", login, "Off by default. FormTray waits in the menu bar until a hotkey or the Dock icon calls it.")),
        section("Apps", list),
        section("Where to look", locations, rescan),
        section("Hotkeys", keys),
        section("About", about, credit, updates),
      );
      root.append(head, body);
      window.addEventListener("keydown", onCapture, true);
      this.update(ctx.snap);
    },
    update(snap) {
      ctx.snap = snap;
      if (document.activeElement !== defaultView) defaultView.value = snap.prefs.default_view;
      if (document.activeElement !== login) login.checked = snap.prefs.open_at_login;
      if (document.activeElement !== locations) locations.value = snap.prefs.locations.join("\n");
      syncRows(snap);
      void renderKeys(snap);
    },
    shown() {
      void renderKeys(ctx.snap);
    },
  };
}
