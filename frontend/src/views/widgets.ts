import type { AppState, Tile } from "../bridge";
import { icons } from "../icons";
import { ago, appIcon, el, iconButton, runDot, viewBar } from "../ui";
import type { Ctx, ViewModule } from "./types";

const SIZES: Tile["size"][] = ["s", "m", "l"];

export function widgets(): ViewModule {
  let ctx: Ctx;
  let root: HTMLElement;
  let board: HTMLElement;
  let editBtn: HTMLButtonElement;
  let addMenu: HTMLElement;
  let empty: HTMLElement;
  const tiles = new Map<string, { node: HTMLElement; meta: HTMLElement; size: Tile["size"] }>();
  let editing = false;
  let dragging: HTMLElement | null = null;

  const byId = (id: string) => ctx.snap.apps.find((a) => a.id === id);

  function describe(app: AppState): string {
    if (app.running) return "Open now";
    if (!app.installed) return "Not installed";
    return app.last ? `Opened ${ago(app.last)}` : "Not opened yet";
  }

  function make(app: AppState, size: Tile["size"]) {
    const node = el("article", "wg-tile");
    node.dataset.app = app.id;
    node.dataset.size = size;
    node.style.setProperty("--hue", app.hue);
    const face = el("button", "wg-face");
    face.type = "button";
    face.setAttribute("aria-label", `Open ${app.name}`);
    const id = app.id;
    face.addEventListener("click", () => {
      if (!editing) ctx.open(id);
    });
    const text = el("div", "wg-text");
    const meta = el("p", "wg-meta");
    text.append(el("h3", "wg-name", app.name), el("p", "wg-alt", app.alt_of ? `Instead of ${app.alt_of}` : "Built from scratch"), meta);
    face.append(appIcon(app, size === "s" ? "m" : "l"), runDot(), text);
    const tools = el("div", "wg-tools");
    tools.append(
      iconButton(icons.resize, "Change size", () => {
        const t = tiles.get(id);
        if (!t) return;
        t.size = SIZES[(SIZES.indexOf(t.size) + 1) % SIZES.length];
        t.node.dataset.size = t.size;
        save();
      }),
      iconButton(icons.close, "Remove from board", () => {
        tiles.get(id)?.node.remove();
        tiles.delete(id);
        save();
        fillAdd();
      }),
    );
    node.append(face, tools);
    node.addEventListener("dragstart", (e) => {
      if (!editing) return e.preventDefault();
      dragging = node;
      node.classList.add("is-dragging");
      e.dataTransfer?.setData("text/plain", id);
    });
    node.addEventListener("dragend", () => {
      node.classList.remove("is-dragging");
      dragging = null;
      save();
    });
    node.addEventListener("dragover", (e) => {
      if (!dragging || dragging === node) return;
      e.preventDefault();
      const r = node.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      board.insertBefore(dragging, after ? node.nextSibling : node);
    });
    return { node, meta, size };
  }

  function order(): Tile[] {
    return [...board.querySelectorAll<HTMLElement>(".wg-tile")].map((n) => ({ app: n.dataset.app ?? "", size: (n.dataset.size as Tile["size"]) ?? "m" }));
  }

  function save() {
    empty.hidden = tiles.size > 0;
    ctx.savePrefs({ ...ctx.snap.prefs, widgets: order() });
  }

  function fillAdd() {
    addMenu.replaceChildren();
    const missing = ctx.snap.apps.filter((a) => !tiles.has(a.id) && !a.hidden);
    for (const app of missing) {
      const b = el("button", "wg-add-item");
      b.type = "button";
      b.append(appIcon(app, "s"), el("span", "", app.name));
      b.addEventListener("click", () => {
        const t = make(app, "m");
        tiles.set(app.id, t);
        t.meta.textContent = describe(app);
        t.node.draggable = editing;
        board.append(t.node);
        b.remove();
        save();
      });
      addMenu.append(b);
    }
    if (!missing.length) addMenu.append(el("p", "wg-add-none", "Every app is on the board."));
  }

  function setEditing(on: boolean) {
    editing = on;
    root.classList.toggle("is-editing", on);
    editBtn.innerHTML = on ? icons.check : icons.edit;
    editBtn.title = on ? "Done" : "Edit board";
    editBtn.setAttribute("aria-pressed", String(on));
    tiles.forEach((t) => (t.node.draggable = on));
    if (on) fillAdd();
  }

  return {
    mount(r, c) {
      ctx = c;
      root = r;
      root.classList.add("v-widgets");
      const head = el("header", "pn-head");
      head.setAttribute("data-tauri-drag-region", "");
      editBtn = iconButton(icons.edit, "Edit board", () => setEditing(!editing), "wg-edit");
      head.append(el("h1", "pn-title", "Widgets"), viewBar("widgets", (v) => ctx.go(v)), editBtn, iconButton(icons.gear, "Settings", () => ctx.go("prefs")));
      board = el("div", "wg-board");
      empty = el("p", "pn-empty", "The board is empty. Choose Edit to add apps.");
      addMenu = el("div", "wg-add");
      addMenu.setAttribute("aria-label", "Add to board");
      for (const t of ctx.snap.prefs.widgets) {
        const app = byId(t.app);
        if (!app || tiles.has(app.id)) continue;
        const made = make(app, t.size);
        made.meta.textContent = describe(app);
        tiles.set(app.id, made);
        board.append(made.node);
      }
      empty.hidden = tiles.size > 0;
      root.append(head, board, empty, addMenu);
    },
    update(snap) {
      ctx.snap = snap;
      for (const app of snap.apps) {
        const t = tiles.get(app.id);
        if (!t) continue;
        t.node.classList.toggle("is-running", app.running);
        t.node.classList.toggle("is-missing", !app.installed);
        const text = describe(app);
        if (t.meta.textContent !== text) t.meta.textContent = text;
      }
    },
    shown() {
      setEditing(false);
    },
    key(e) {
      if (e.key === "Escape" && editing) return setEditing(false), true;
      return false;
    },
  };
}
