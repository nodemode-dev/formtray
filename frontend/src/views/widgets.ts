import type { AppState, Tile } from "../bridge";
import { icons } from "../icons";
import { ago, appIcon, appName, el, iconButton, runDot, viewBar } from "../ui";
import type { Ctx, ViewModule } from "./types";

const SIZES: Tile["size"][] = ["s", "m", "l"];

export function widgets(): ViewModule {
  let ctx: Ctx;
  let root: HTMLElement;
  let board: HTMLElement;
  let editBtn: HTMLButtonElement;
  let addMenu: HTMLElement;
  let empty: HTMLElement;
  type Entry = { node: HTMLElement; meta: HTMLElement; size: Tile["size"]; tile: Tile; minis?: HTMLElement; name?: HTMLElement };
  const tiles = new Map<string, Entry>();
  let editing = false;
  let dragging: HTMLElement | null = null;
  let addingTo: string | null = null;
  let pop: HTMLElement;
  let popTitle: HTMLElement;
  let popList: HTMLElement;

  const byId = (id: string) => ctx.snap.apps.find((a) => a.id === id);

  function describe(app: AppState): string {
    if (app.running) return "Open now";
    if (!app.installed) return "Not installed";
    return app.last ? `Opened ${ago(app.last)}` : "Not opened yet";
  }

  function toolsFor(key: string, extra: HTMLButtonElement[] = []): HTMLElement {
    const tools = el("div", "wg-tools");
    tools.append(
      ...extra,
      iconButton(icons.resize, "Change size", () => {
        const t = tiles.get(key);
        if (!t) return;
        t.size = SIZES[(SIZES.indexOf(t.size) + 1) % SIZES.length];
        t.node.dataset.size = t.size;
        save();
      }),
      iconButton(icons.close, "Remove from board", () => {
        tiles.get(key)?.node.remove();
        tiles.delete(key);
        if (addingTo === key) addingTo = null;
        save();
        fillAdd();
      }),
    );
    return tools;
  }

  function wireDrag(node: HTMLElement) {
    node.addEventListener("dragstart", (e) => {
      if (!editing || (e.target as HTMLElement).isContentEditable) return e.preventDefault();
      dragging = node;
      node.classList.add("is-dragging");
      e.dataTransfer?.setData("text/plain", node.dataset.id ?? "");
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
      board.insertBefore(dragging, e.clientX > r.left + r.width / 2 ? node.nextSibling : node);
    });
  }

  function fillGroup(entry: Entry) {
    const members = entry.tile.apps.map(byId).filter((a): a is AppState => Boolean(a));
    entry.minis?.replaceChildren(...members.slice(0, 4).map((a) => appIcon(a, "s")));
    entry.meta.textContent = members.length === 1 ? "1 app" : `${members.length} apps`;
  }

  function makeGroup(tile: Tile): Entry {
    const node = el("article", "wg-tile wg-group");
    node.dataset.id = tile.id;
    node.dataset.kind = "group";
    node.dataset.size = tile.size;
    const face = el("button", "wg-face");
    face.type = "button";
    const minis = el("div", "wg-minis");
    const name = el("h3", "wg-name", tile.name || "Group");
    const meta = el("p", "wg-meta");
    const text = el("div", "wg-text");
    text.append(name, meta);
    face.append(minis, text);
    face.addEventListener("click", () => {
      if (!editing) openPop(tile.id);
    });
    name.addEventListener("blur", () => {
      const entry = tiles.get(tile.id);
      if (!entry) return;
      entry.tile.name = (name.textContent ?? "").trim() || "Group";
      name.textContent = entry.tile.name;
      save();
    });
    name.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        name.blur();
      }
    });
    const add = iconButton(icons.plus, "Add apps to this group", () => {
      addingTo = tile.id;
      fillAdd();
    });
    node.append(face, toolsFor(tile.id, [add]));
    wireDrag(node);
    const entry: Entry = { node, meta, size: tile.size, tile: { ...tile, apps: [...tile.apps] }, minis, name };
    fillGroup(entry);
    return entry;
  }

  function updatesText(): string {
    if (!ctx.snap.portal) return "FormPortal not found";
    const n = ctx.snap.updates.length;
    return n === 0 ? "Everything is up to date" : n === 1 ? "1 update waiting" : `${n} updates waiting`;
  }

  function fillUpdates(entry: Entry) {
    entry.meta.textContent = updatesText();
    entry.minis?.replaceChildren(
      ...ctx.snap.updates.slice(0, 3).map((u) => el("li", "wg-update", `${byId(u.id)?.name ?? u.id} ${u.from} to ${u.to}`)),
    );
    entry.node.classList.toggle("has-updates", ctx.snap.updates.length > 0);
  }

  function makeUpdates(tile: Tile): Entry {
    const node = el("article", "wg-tile wg-updates");
    node.dataset.id = "updates";
    node.dataset.kind = "updates";
    node.dataset.size = tile.size;
    const portal = byId("formportal");
    if (portal) node.style.setProperty("--hue", portal.hue);
    const face = el("button", "wg-face");
    face.type = "button";
    face.setAttribute("aria-label", "Open FormPortal for updates");
    face.addEventListener("click", () => {
      if (!editing) ctx.updates();
    });
    const meta = el("p", "wg-meta");
    const list = el("ul", "wg-update-list");
    const text = el("div", "wg-text");
    text.append(el("h3", "wg-name", "Updates"), meta, list);
    const badge = el("span", "wg-badge");
    if (portal) face.append(appIcon(portal, "m"));
    face.append(text, badge);
    node.append(face, toolsFor("updates"));
    wireDrag(node);
    const entry: Entry = { node, meta, size: tile.size, tile: { ...tile, id: "updates" }, minis: list };
    fillUpdates(entry);
    return entry;
  }

  function openPop(key: string) {
    const entry = tiles.get(key);
    if (!entry) return;
    popTitle.textContent = entry.tile.name || "Group";
    popList.replaceChildren(
      ...entry.tile.apps
        .map(byId)
        .filter((a): a is AppState => Boolean(a))
        .map((app) => {
          const b = el("button", "wg-pop-app");
          b.type = "button";
          b.append(appIcon(app, "m"), el("span", "", app.name));
          b.addEventListener("click", () => {
            closePop();
            ctx.open(app.id);
          });
          return b;
        }),
    );
    if (!entry.tile.apps.length) popList.append(el("p", "wg-add-none", "This group is empty. Choose Edit, then the plus on the group."));
    pop.hidden = false;
  }

  function closePop() {
    pop.hidden = true;
  }

  function make(app: AppState, size: Tile["size"]): Entry {
    const node = el("article", "wg-tile");
    node.dataset.app = app.id;
    node.dataset.id = app.id;
    node.dataset.kind = "app";
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
    text.append(appName("h3", "wg-name", app), el("p", "wg-alt", app.alt_of ? `Instead of ${app.alt_of}` : "Built from scratch"), meta);
    face.append(appIcon(app, size === "s" ? "m" : "l"), runDot(), text);
    node.append(face, toolsFor(id));
    wireDrag(node);
    return { node, meta, size, tile: { kind: "app", id, app: id, name: "", apps: [], size } };
  }

  function order(): Tile[] {
    return [...board.querySelectorAll<HTMLElement>(".wg-tile")]
      .map((n) => tiles.get(n.dataset.id ?? ""))
      .filter((t): t is Entry => Boolean(t))
      .map((t) => ({ ...t.tile, size: t.size }));
  }

  function chip(icon: Node, label: string, onClick: (b: HTMLButtonElement) => void, cls = ""): HTMLButtonElement {
    const b = el("button", `wg-add-item ${cls}`.trim());
    b.type = "button";
    b.append(icon, el("span", "", label));
    b.addEventListener("click", () => onClick(b));
    return b;
  }

  function glyph(svg: string): HTMLElement {
    const g = el("span", "wg-chip-glyph");
    g.innerHTML = svg;
    return g;
  }

  function place(entry: Entry) {
    tiles.set(entry.tile.kind === "app" ? entry.tile.app : entry.tile.id, entry);
    entry.node.draggable = editing;
    board.append(entry.node);
    if (entry.name) entry.name.contentEditable = editing ? "plaintext-only" : "false";
  }

  function save() {
    empty.hidden = tiles.size > 0;
    ctx.savePrefs({ ...ctx.snap.prefs, widgets: order() });
  }

  function fillAdd() {
    addMenu.replaceChildren();
    const group = addingTo ? tiles.get(addingTo) : undefined;
    if (group) {
      addMenu.append(chip(glyph(icons.check), `Done adding to ${group.tile.name || "Group"}`, () => {
        addingTo = null;
        fillAdd();
      }, "is-primary"));
      for (const app of ctx.snap.apps.filter((a) => !a.hidden && !group.tile.apps.includes(a.id))) {
        addMenu.append(chip(appIcon(app, "s"), app.name, (b) => {
          group.tile.apps.push(app.id);
          fillGroup(group);
          b.remove();
          save();
        }));
      }
      return;
    }
    addMenu.append(chip(glyph(icons.grid), "New group", () => {
      const entry = makeGroup({ kind: "group", id: `group-${Date.now().toString(36)}`, app: "", name: "Group", apps: [], size: "m" });
      place(entry);
      addingTo = entry.tile.id;
      save();
      fillAdd();
    }));
    if (!tiles.has("updates")) {
      addMenu.append(chip(glyph(icons.enter), "FormPortal updates", (b) => {
        place(makeUpdates({ kind: "updates", id: "updates", app: "", name: "", apps: [], size: "m" }));
        b.remove();
        save();
      }));
    }
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
    tiles.forEach((t) => {
      t.node.draggable = on;
      if (t.name) t.name.contentEditable = on ? "plaintext-only" : "false";
    });
    if (!on) addingTo = null;
    closePop();
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
      pop = el("div", "wg-pop");
      pop.hidden = true;
      pop.setAttribute("role", "dialog");
      const popHead = el("div", "wg-pop-head");
      popTitle = el("h2", "wg-pop-title");
      popHead.append(popTitle, iconButton(icons.close, "Close group", closePop));
      popList = el("div", "wg-pop-list");
      pop.append(popHead, popList);
      for (const t of ctx.snap.prefs.widgets) {
        const kind = t.kind ?? "app";
        if (kind === "group" && t.id && !tiles.has(t.id)) {
          place(makeGroup(t));
        } else if (kind === "updates" && !tiles.has("updates")) {
          place(makeUpdates(t));
        } else if (kind === "app") {
          const app = byId(t.app);
          if (!app || tiles.has(app.id)) continue;
          const made = make(app, t.size);
          made.meta.textContent = describe(app);
          place(made);
        }
      }
      empty.hidden = tiles.size > 0;
      root.append(head, board, empty, addMenu, pop);
      root.addEventListener("pointerdown", (e) => {
        if (!pop.hidden && !pop.contains(e.target as Node) && !(e.target as HTMLElement).closest(".wg-group")) closePop();
      });
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
      const updates = tiles.get("updates");
      if (updates && updates.meta.textContent !== updatesText()) fillUpdates(updates);
    },
    shown() {
      setEditing(false);
    },
    key(e) {
      if (e.key === "Escape" && !pop.hidden) return closePop(), true;
      if (e.key === "Escape" && editing) return setEditing(false), true;
      if ((e.target as HTMLElement).isContentEditable) return true;
      return false;
    },
  };
}
