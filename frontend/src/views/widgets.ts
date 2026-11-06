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
  type Entry = { node: HTMLElement; meta: HTMLElement; size: Tile["size"]; tile: Tile; minis?: HTMLElement; name?: HTMLElement; icon?: HTMLElement };
  type Want = { key: string; label: string; build: () => HTMLElement };
  const tiles = new Map<string, Entry>();
  let pending: Tile[] = [];
  let dragFrom = "";
  let appsSig = "";
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
        if (t.icon) {
          const want = t.size === "s" ? "m" : "l";
          t.icon.classList.remove("app-icon-s", "app-icon-m", "app-icon-l");
          t.icon.classList.add(`app-icon-${want}`);
        }
        save();
      }),
      iconButton(icons.close, "Remove from board", () => {
        const t = tiles.get(key);
        if (!t) return;
        const hadFocus = t.node.contains(document.activeElement);
        const near = (t.node.nextElementSibling ?? t.node.previousElementSibling)?.querySelector<HTMLElement>(".wg-face");
        t.node.remove();
        tiles.delete(key);
        if (addingTo === key) addingTo = null;
        if (hadFocus) near?.focus();
        save();
        syncAdd();
      }),
    );
    return tools;
  }

  function wireDrag(node: HTMLElement) {
    node.addEventListener("dragstart", (e) => {
      if (!editing || (e.target as HTMLElement).isContentEditable) return e.preventDefault();
      dragging = node;
      dragFrom = order().map((t) => t.id).join(",");
      node.classList.add("is-dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", node.dataset.id ?? "");
      }
    });
    node.addEventListener("dragend", () => {
      node.classList.remove("is-dragging");
      dragging = null;
      if (order().map((t) => t.id).join(",") !== dragFrom) save();
    });
    node.addEventListener("dragover", (e) => {
      if (!dragging) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      if (dragging === node) return;
      const r = node.getBoundingClientRect();
      const before = e.clientX < r.left + r.width / 2;
      const forward = Boolean(dragging.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (forward && !before) board.insertBefore(dragging, node.nextSibling);
      else if (!forward && before) board.insertBefore(dragging, node);
    });
  }

  function fillGroup(entry: Entry) {
    const members = entry.tile.apps.map(byId).filter((a): a is AppState => Boolean(a));
    entry.node.dataset.members = members.map((a) => a.id).join(",");
    entry.minis?.replaceChildren(...members.slice(0, 4).map((a) => appIcon(a, "s")));
    const text = members.length === 1 ? "1 app" : `${members.length} apps`;
    if (entry.meta.textContent !== text) entry.meta.textContent = text;
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
      const next = (name.textContent ?? "").trim() || "Group";
      if (name.textContent !== next) name.textContent = next;
      if (entry.tile.name === next) return;
      entry.tile.name = next;
      save();
      syncAdd();
    });
    name.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        name.blur();
      }
    });
    const add = iconButton(icons.plus, "Add apps to this group", () => {
      addingTo = tile.id;
      syncAdd();
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
    const label = updatesText();
    if (entry.meta.textContent !== label) entry.meta.textContent = label;
    const rows = ctx.snap.updates.slice(0, 3).map((u) => `${byId(u.id)?.name ?? u.id} ${u.from} to ${u.to}`);
    const sig = rows.join("\n");
    if (entry.node.dataset.sig !== sig) {
      entry.node.dataset.sig = sig;
      entry.minis?.replaceChildren(...rows.map((r) => el("li", "wg-update", r)));
    }
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
    const icon = appIcon(app, size === "s" ? "m" : "l");
    face.append(icon, runDot(), text);
    node.append(face, toolsFor(id));
    wireDrag(node);
    const entry: Entry = { node, meta, size, tile: { kind: "app", id, app: id, name: "", apps: [], size }, icon };
    refreshApp(entry, app);
    return entry;
  }

  function refreshApp(t: Entry, app: AppState) {
    t.node.classList.toggle("is-running", app.running);
    t.node.classList.toggle("is-missing", !app.installed);
    if (t.node.style.getPropertyValue("--hue") !== app.hue) t.node.style.setProperty("--hue", app.hue);
    const label = `Open ${app.name}`;
    const face = t.node.firstElementChild;
    if (face && face.getAttribute("aria-label") !== label) face.setAttribute("aria-label", label);
    const text = describe(app);
    if (t.meta.textContent !== text) t.meta.textContent = text;
  }

  function admit(t: Tile): boolean {
    const kind = t.kind ?? "app";
    if (kind === "group") {
      if (!t.id) return false;
      if (tiles.has(t.id)) return true;
      place(makeGroup(t));
      return true;
    }
    if (kind === "updates") {
      if (tiles.has("updates")) return true;
      if (!byId("formportal")) return false;
      place(makeUpdates(t));
      return true;
    }
    const app = byId(t.app);
    if (!app) return false;
    if (tiles.has(app.id)) return true;
    place(make(app, t.size));
    return true;
  }

  function reconcileTiles() {
    for (const [key, t] of [...tiles]) {
      const gone = t.tile.kind === "app" ? !byId(t.tile.app) : t.tile.kind === "updates" ? !byId("formportal") : false;
      if (!gone) continue;
      pending.push({ ...t.tile, size: t.size });
      t.node.remove();
      tiles.delete(key);
      if (addingTo === key) addingTo = null;
    }
    pending = pending.filter((t) => !admit(t));
  }

  function order(): Tile[] {
    return [...board.querySelectorAll<HTMLElement>(".wg-tile")]
      .map((n) => tiles.get(n.dataset.id ?? ""))
      .filter((t): t is Entry => Boolean(t))
      .map((t) => ({ ...t.tile, size: t.size }))
      .concat(pending);
  }

  function chip(icon: Node, label: string, onClick: (b: HTMLButtonElement) => void, cls = ""): HTMLButtonElement {
    const b = el("button", `wg-add-item ${cls}`.trim());
    b.type = "button";
    b.append(icon, el("span", "wg-chip-label", label));
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

  function reconcileAdd(want: Want[]) {
    const keep = new Set(want.map((w) => w.key));
    const have = new Map<string, HTMLElement>();
    let refocus = -1;
    for (const c of [...addMenu.children] as HTMLElement[]) {
      const k = c.dataset.key ?? "";
      if (keep.has(k) && !have.has(k)) {
        have.set(k, c);
        continue;
      }
      if (c.contains(document.activeElement)) refocus = [...addMenu.children].indexOf(c);
      c.remove();
    }
    let prev: Element | null = null;
    for (const w of want) {
      let node = have.get(w.key);
      if (!node) {
        node = w.build();
        node.dataset.key = w.key;
      } else {
        const lab = node.querySelector(".wg-chip-label");
        if (lab && lab.textContent !== w.label) lab.textContent = w.label;
      }
      const at: Element | null = prev ? prev.nextElementSibling : addMenu.firstElementChild;
      if (node !== at) addMenu.insertBefore(node, at);
      prev = node;
    }
    if (refocus >= 0) {
      const target = addMenu.children[Math.min(refocus, addMenu.children.length - 1)];
      if (target instanceof HTMLButtonElement) target.focus();
    }
  }

  function syncAdd() {
    const want: Want[] = [];
    const group = addingTo ? tiles.get(addingTo) : undefined;
    if (group) {
      const gid = group.tile.id;
      const doneLabel = `Done adding to ${group.tile.name || "Group"}`;
      want.push({
        key: `done:${gid}`,
        label: doneLabel,
        build: () => chip(glyph(icons.check), doneLabel, () => {
          addingTo = null;
          syncAdd();
        }, "is-primary"),
      });
      for (const app of ctx.snap.apps.filter((a) => !a.hidden && !group.tile.apps.includes(a.id))) {
        const id = app.id;
        want.push({
          key: `g:${id}`,
          label: app.name,
          build: () => chip(appIcon(app, "s"), app.name, () => {
            const g = tiles.get(gid);
            if (!g || g.tile.apps.includes(id)) return;
            g.tile.apps.push(id);
            fillGroup(g);
            save();
            syncAdd();
          }),
        });
      }
      reconcileAdd(want);
      return;
    }
    want.push({
      key: "new-group",
      label: "New group",
      build: () => chip(glyph(icons.grid), "New group", () => {
        const entry = makeGroup({ kind: "group", id: `group-${Date.now().toString(36)}`, app: "", name: "Group", apps: [], size: "m" });
        place(entry);
        addingTo = entry.tile.id;
        save();
        syncAdd();
      }),
    });
    if (!tiles.has("updates") && byId("formportal")) {
      want.push({
        key: "updates",
        label: "FormPortal updates",
        build: () => chip(glyph(icons.enter), "FormPortal updates", () => {
          place(makeUpdates({ kind: "updates", id: "updates", app: "", name: "", apps: [], size: "m" }));
          save();
          syncAdd();
        }),
      });
    }
    const missing = ctx.snap.apps.filter((a) => !tiles.has(a.id) && !a.hidden);
    for (const app of missing) {
      const id = app.id;
      want.push({
        key: `a:${id}`,
        label: app.name,
        build: () => chip(appIcon(app, "s"), app.name, () => {
          const cur = byId(id);
          if (!cur || tiles.has(id)) return;
          place(make(cur, "m"));
          save();
          syncAdd();
        }),
      });
    }
    if (!missing.length) {
      want.push({ key: "none", label: "", build: () => el("p", "wg-add-none", "Every app is on the board.") });
    }
    reconcileAdd(want);
  }

  function setEditing(on: boolean) {
    editing = on;
    root.classList.toggle("is-editing", on);
    if (editBtn.dataset.on !== String(on)) {
      editBtn.dataset.on = String(on);
      editBtn.innerHTML = on ? icons.check : icons.edit;
    }
    editBtn.title = on ? "Done" : "Edit board";
    editBtn.setAttribute("aria-pressed", String(on));
    tiles.forEach((t) => {
      t.node.draggable = on;
      if (t.name) t.name.contentEditable = on ? "plaintext-only" : "false";
    });
    if (!on) addingTo = null;
    closePop();
    syncAdd();
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
      appsSig = ctx.snap.apps.map((a) => a.id).join(",");
      for (const t of ctx.snap.prefs.widgets) {
        if (!admit(t)) pending.push({ ...t });
      }
      empty.hidden = tiles.size > 0;
      root.append(head, board, empty, addMenu, pop);
      syncAdd();
      root.addEventListener("pointerdown", (e) => {
        if (!pop.hidden && !pop.contains(e.target as Node) && !(e.target as HTMLElement).closest(".wg-group")) closePop();
      });
    },
    update(snap) {
      ctx.snap = snap;
      const before = tiles.size;
      reconcileTiles();
      empty.hidden = tiles.size > 0;
      for (const app of snap.apps) {
        const t = tiles.get(app.id);
        if (t) refreshApp(t, app);
      }
      for (const t of tiles.values()) {
        if (t.tile.kind !== "group") continue;
        const key = t.tile.apps.filter((id) => byId(id)).join(",");
        if (t.node.dataset.members !== key) fillGroup(t);
      }
      const updates = tiles.get("updates");
      if (updates) fillUpdates(updates);
      const sig = snap.apps.map((a) => a.id).join(",");
      if (sig !== appsSig || before !== tiles.size) {
        appsSig = sig;
        syncAdd();
      }
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
