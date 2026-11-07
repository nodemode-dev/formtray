import type { AppState, Tile } from "../bridge";
import type { Docked } from "../ext/host";
import { icons } from "../icons";
import { ago, appIcon, appName, el, iconButton, runDot, viewBar } from "../ui";
import type { Ctx, ViewModule } from "./types";

const SIZES: Tile["size"][] = ["s", "m", "l"];
const GRIP =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';

export function widgets(): ViewModule {
  let ctx: Ctx;
  let root: HTMLElement;
  let board: HTMLElement;
  let editBtn: HTMLButtonElement;
  let editIcon: HTMLElement;
  let editLabel: HTMLElement;
  let addMenu: HTMLElement;
  let addBar: HTMLElement;
  let hint: HTMLElement;
  let empty: HTMLElement;
  type Entry = { node: HTMLElement; meta: HTMLElement; size: Tile["size"]; tile: Tile; minis?: HTMLElement; name?: HTMLElement; icon?: HTMLElement; input?: HTMLInputElement; fit?: () => void; ro?: ResizeObserver; commit?: () => void; mounted?: Docked | null; mount?: () => void };
  type Want = { key: string; label: string; build: () => HTMLElement };
  const tiles = new Map<string, Entry>();
  let pending: Tile[] = [];
  type Drag = { node: HTMLElement; ph: HTMLElement; id: number; sx: number; sy: number; active: boolean; from: string; next: Element | null; px: number; py: number; raf: number; hold: { x: number; y: number; t: HTMLElement } | null };
  let drag: Drag | null = null;
  let appsSig = "";
  let editing = false;
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

  function dispose(t: Entry) {
    t.ro?.disconnect();
    t.mounted?.dispose();
    t.mounted = null;
    if (marked === t.node) {
      window.clearTimeout(markTimer);
      marked = null;
    }
    t.node.remove();
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
        t.fit?.();
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
        dispose(t);
        tiles.delete(key);
        if (addingTo === key) addingTo = null;
        if (hadFocus) near?.focus();
        save();
        syncAdd();
      }),
    );
    return tools;
  }

  function orderKey(): string {
    return order().map((t) => t.id).join(",");
  }

  function reposition(px: number, py: number) {
    if (!drag) return;
    const d = drag;
    const { node, ph } = d;
    if (d.hold) {
      const h = d.hold.t.getBoundingClientRect();
      const inside = px >= h.left && px <= h.right && py >= h.top && py <= h.bottom;
      if (inside && Math.hypot(px - d.hold.x, py - d.hold.y) < 8) return;
      d.hold = null;
    }
    for (const t of [...board.children] as HTMLElement[]) {
      if (t === node || t === ph || !t.classList.contains("wg-tile")) continue;
      const r = t.getBoundingClientRect();
      if (px < r.left || px > r.right || py < r.top || py > r.bottom) continue;
      const midX = r.left + r.width / 2;
      const midY = r.top + r.height / 2;
      const before = py < midY || (py <= midY + r.height / 4 && px < midX);
      if (before ? ph.nextSibling === t : ph.previousSibling === t) return;
      board.insertBefore(ph, before ? t : t.nextSibling);
      d.hold = { x: px, y: py, t };
      return;
    }
  }

  function autoscroll() {
    const d = drag;
    if (!d || !d.active) return;
    const r = board.getBoundingClientRect();
    const edge = 40;
    const top = edge - (d.py - r.top);
    const bottom = edge - (r.bottom - d.py);
    let step = 0;
    if (top > 0) step = -Math.min(1, top / edge) * 18;
    else if (bottom > 0) step = Math.min(1, bottom / edge) * 18;
    if (step) {
      const before = board.scrollTop;
      board.scrollTop += step;
      if (board.scrollTop !== before) reposition(d.px, d.py);
    }
    d.raf = requestAnimationFrame(autoscroll);
  }

  function startDrag(d: Drag, e: PointerEvent) {
    const { node, ph } = d;
    const r = node.getBoundingClientRect();
    d.from = orderKey();
    d.next = node.nextElementSibling;
    ph.dataset.size = node.dataset.size ?? "m";
    board.insertBefore(ph, node);
    node.style.setProperty("left", `${r.left}px`);
    node.style.setProperty("top", `${r.top}px`);
    node.style.setProperty("width", `${r.width}px`);
    node.style.setProperty("height", `${r.height}px`);
    node.classList.add("is-dragging");
    const a = node.getBoundingClientRect();
    if (Math.abs(a.left - r.left) > 0.5 || Math.abs(a.top - r.top) > 0.5) {
      node.style.setProperty("left", `${r.left + (r.left - a.left)}px`);
      node.style.setProperty("top", `${r.top + (r.top - a.top)}px`);
    }
    try {
      node.setPointerCapture(e.pointerId);
    } catch {
      void 0;
    }
    d.active = true;
    d.px = e.clientX;
    d.py = e.clientY;
    d.raf = requestAnimationFrame(autoscroll);
  }

  function endDrag(commit: boolean) {
    const d = drag;
    drag = null;
    if (d) cancelAnimationFrame(d.raf);
    if (!d || !d.active) return;
    const { node, ph } = d;
    try {
      node.releasePointerCapture(d.id);
    } catch {
      void 0;
    }
    if (!commit) board.insertBefore(ph, d.next);
    board.insertBefore(node, ph);
    ph.remove();
    node.classList.remove("is-dragging");
    for (const p of ["transform", "left", "top", "width", "height"]) node.style.removeProperty(p);
    if (commit && orderKey() !== d.from) save();
  }

  function shift(node: HTMLElement, dir: -1 | 1) {
    if (drag?.active) return;
    const sib = (dir < 0 ? node.previousElementSibling : node.nextElementSibling) as HTMLElement | null;
    if (!sib || !sib.classList.contains("wg-tile")) return;
    board.insertBefore(node, dir < 0 ? sib : sib.nextSibling);
    node.querySelector<HTMLElement>(".wg-face")?.focus();
    node.scrollIntoView({ block: "nearest" });
    save();
  }

  function wireReorder(node: HTMLElement) {
    const grip = el("span", "wg-grip");
    grip.title = "Drag to reorder";
    grip.innerHTML = GRIP;
    node.append(grip);
    node.addEventListener("pointerdown", (e) => {
      if (!editing || drag?.active || e.button !== 0 || !e.isPrimary) return;
      if ((e.target as HTMLElement).closest(".wg-tools, .wg-name-input")) return;
      drag = { node, ph: el("div", "wg-ph"), id: e.pointerId, sx: e.clientX, sy: e.clientY, active: false, from: "", next: null, px: e.clientX, py: e.clientY, raf: 0, hold: null };
    });
    node.addEventListener("pointermove", (e) => {
      const d = drag;
      if (!d || d.node !== node || e.pointerId !== d.id) return;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (!d.active) {
        if (Math.hypot(dx, dy) <= 4) return;
        startDrag(d, e);
      }
      node.style.setProperty("transform", `translate(${dx}px, ${dy}px)`);
      d.px = e.clientX;
      d.py = e.clientY;
      reposition(e.clientX, e.clientY);
    });
    node.addEventListener("pointerup", (e) => {
      if (drag && drag.node === node && e.pointerId === drag.id) endDrag(true);
    });
    node.addEventListener("pointercancel", (e) => {
      if (drag && drag.node === node && e.pointerId === drag.id) endDrag(false);
    });
    node.addEventListener("lostpointercapture", () => {
      if (drag && drag.node === node) endDrag(false);
    });
    node.addEventListener("keydown", (e) => {
      if (!editing || !e.altKey || (e.target as HTMLElement).closest(".wg-name-input")) return;
      const dir = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : 0;
      if (!dir) return;
      e.preventDefault();
      shift(node, dir);
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
    const input = el("input", "wg-name-input");
    input.type = "text";
    input.maxLength = 40;
    input.value = tile.name || "Group";
    input.spellcheck = false;
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Group name");
    let revert = false;
    const fit = () => {
      if (!editing) return;
      const show = name.offsetWidth > 0;
      const box = show
        ? {
            left: `${name.offsetLeft}px`,
            top: `${name.offsetTop}px`,
            width: `${Math.max(0, node.clientWidth - name.offsetLeft - 16)}px`,
            height: `${name.offsetHeight}px`,
          }
        : {
            left: "6px",
            top: `${Math.max(0, node.clientHeight - 26)}px`,
            width: `${Math.max(0, node.clientWidth - 12)}px`,
            height: "20px",
          };
      for (const k of Object.keys(box) as (keyof typeof box)[]) {
        if (input.style[k] !== box[k]) input.style[k] = box[k];
      }
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        revert = true;
        input.blur();
      }
    });
    const commit = () => {
      const entry = tiles.get(tile.id);
      if (!entry) return;
      if (revert) {
        revert = false;
        input.value = entry.tile.name || "Group";
        return;
      }
      const next = input.value.trim() || "Group";
      if (input.value !== next) input.value = next;
      if (entry.tile.name === next) return;
      entry.tile.name = next;
      name.textContent = next;
      save();
      syncAdd();
    };
    input.addEventListener("blur", commit);
    const add = iconButton(icons.plus, "Add apps to this group", () => {
      addingTo = tile.id;
      syncAdd();
    });
    node.append(face, input, toolsFor(tile.id, [add]));
    wireReorder(node);
    const entry: Entry = { node, meta, size: tile.size, tile: { ...tile, apps: [...tile.apps] }, minis, name, input, fit, commit };
    entry.ro = new ResizeObserver(fit);
    entry.ro.observe(node);
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
    wireReorder(node);
    const entry: Entry = { node, meta, size: tile.size, tile: { ...tile, id: "updates" }, minis: list };
    fillUpdates(entry);
    return entry;
  }

  function makeExt(tile: Tile): Entry {
    const node = el("article", "wg-tile wg-ext");
    node.dataset.id = tile.id;
    node.dataset.kind = "extension";
    node.dataset.size = tile.size;
    const face = el("div", "wg-face wg-ext-face");
    face.tabIndex = 0;
    const title = el("h3", "wg-name wg-ext-title");
    const box = el("div", "wg-ext-box");
    face.append(title, box);
    node.append(face, toolsFor(tile.id));
    wireReorder(node);
    const entry: Entry = { node, meta: title, size: tile.size, tile: { ...tile, apps: [] }, name: title };
    entry.mount = () => {
      entry.mounted?.dispose();
      entry.mounted = ctx.ext?.mountPanel(tile.app, tile.name, box, title) ?? null;
    };
    entry.mount();
    return entry;
  }

  function dock(id: string, panel: string) {
    const key = `ext:${id}:${panel}`;
    const have = tiles.get(key);
    if (have) {
      reveal(have);
      return;
    }
    pending = pending.filter((t) => t.id !== key);
    const entry = makeExt({ kind: "extension", id: key, app: id, name: panel, apps: [], size: "l" });
    place(entry);
    save();
    syncAdd();
    reveal(entry);
  }

  function extChanged() {
    for (const t of tiles.values()) {
      if (t.tile.kind !== "extension") continue;
      const rec = ctx.ext?.get(t.tile.app);
      if (rec && t.mounted && rec.version !== t.mounted.version) t.mount?.();
      else if (rec && t.mounted && ctx.ext?.state(rec) === "ready" && !t.node.querySelector("iframe")) t.mount?.();
    }
    reconcileTiles();
    empty.hidden = tiles.size > 0;
    syncAdd();
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
    wireReorder(node);
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
    if (kind === "extension") {
      if (!t.id || !ctx.ext?.dockable(t.app, t.name)) return false;
      if (tiles.has(t.id)) return true;
      place(makeExt(t));
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
      const gone = t.tile.kind === "app" ? !byId(t.tile.app) : t.tile.kind === "updates" ? !byId("formportal") : t.tile.kind === "extension" ? !ctx.ext?.dockable(t.tile.app, t.tile.name) : false;
      if (!gone) continue;
      pending.push({ ...t.tile, size: t.size });
      dispose(t);
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
    board.append(entry.node);
    entry.fit?.();
  }

  let markTimer = 0;
  let marked: HTMLElement | null = null;

  function reveal(entry: Entry) {
    marked?.classList.remove("is-new");
    marked = entry.node;
    entry.node.classList.add("is-new");
    entry.node.scrollIntoView({ block: "nearest" });
    window.clearTimeout(markTimer);
    markTimer = window.setTimeout(() => {
      entry.node.classList.remove("is-new");
      if (marked === entry.node) marked = null;
    }, 1600);
  }

  function save() {
    empty.hidden = tiles.size > 0;
    const widgets = order();
    boardSig = sigOf(widgets);
    ctx.savePrefs({ ...ctx.snap.prefs, widgets });
  }

  let boardSig = "";

  function sigOf(list: Tile[]): string {
    return list.map((t) => [t.kind ?? "app", (t.kind ?? "app") === "app" ? t.app : t.id, t.size, t.name, t.apps.join("+")].join("|")).join(",");
  }

  function adopt(list: Tile[]) {
    const want = new Map(list.map((t) => [(t.kind ?? "app") === "app" ? t.app : t.id, t]));
    for (const [key, t] of [...tiles]) {
      if (want.has(key)) continue;
      dispose(t);
      tiles.delete(key);
      if (addingTo === key) addingTo = null;
    }
    pending = [];
    for (const t of list) {
      const key = (t.kind ?? "app") === "app" ? t.app : t.id;
      const have = tiles.get(key);
      if (!have) {
        if (!admit(t)) pending.push({ ...t });
        continue;
      }
      if (have.size !== t.size) {
        have.size = t.size;
        have.node.dataset.size = t.size;
        have.fit?.();
        if (have.icon) {
          have.icon.classList.remove("app-icon-s", "app-icon-m", "app-icon-l");
          have.icon.classList.add(`app-icon-${t.size === "s" ? "m" : "l"}`);
        }
      }
      if (have.tile.kind === "group") {
        const name = t.name || "Group";
        if (have.tile.name !== name) {
          have.tile.name = name;
          if (have.name) have.name.textContent = name;
          if (have.input) have.input.value = name;
        }
        if (have.tile.apps.join(",") !== t.apps.join(",")) {
          have.tile.apps = [...t.apps];
          fillGroup(have);
        }
      }
    }
    let prev: Element | null = null;
    for (const t of list) {
      const node = tiles.get((t.kind ?? "app") === "app" ? t.app : t.id)?.node;
      if (!node) continue;
      const at: Element | null = prev ? prev.nextElementSibling : board.firstElementChild;
      if (node !== at) board.insertBefore(node, at);
      prev = node;
    }
    empty.hidden = tiles.size > 0;
    syncAdd();
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
    const sep = (key: string, label: string): Want => ({ key, label, build: () => el("span", "wg-add-sep", label) });
    want.push(sep("sep:apps", "Apps"));
    const missing = ctx.snap.apps.filter((a) => !tiles.has(a.id) && !a.hidden);
    for (const app of missing) {
      const id = app.id;
      want.push({
        key: `a:${id}`,
        label: app.name,
        build: () => chip(appIcon(app, "s"), app.name, () => {
          const cur = byId(id);
          if (!cur || tiles.has(id)) return;
          const entry = make(cur, "m");
          place(entry);
          save();
          syncAdd();
          reveal(entry);
        }),
      });
    }
    if (!missing.length) {
      want.push({ key: "none", label: "", build: () => el("p", "wg-add-none", "Every app is on the board.") });
    }
    want.push(sep("sep:more", "Group and FormPortal updates"));
    want.push({
      key: "new-group",
      label: "New group",
      build: () => chip(glyph(icons.grid), "New group", () => {
        const entry = makeGroup({ kind: "group", id: `group-${Date.now().toString(36)}`, app: "", name: "Group", apps: [], size: "m" });
        place(entry);
        addingTo = entry.tile.id;
        save();
        syncAdd();
        reveal(entry);
        entry.fit?.();
        entry.input?.focus();
        entry.input?.select();
      }),
    });
    if (!tiles.has("updates") && byId("formportal")) {
      want.push({
        key: "updates",
        label: "FormPortal updates",
        build: () => chip(glyph(icons.enter), "FormPortal updates", () => {
          const entry = makeUpdates({ kind: "updates", id: "updates", app: "", name: "", apps: [], size: "m" });
          place(entry);
          save();
          syncAdd();
          reveal(entry);
        }),
      });
    }
    const panels = (ctx.ext?.list() ?? []).flatMap((x) => x.panels.filter((p) => p.location !== "dialog" && ctx.ext?.dockable(x.id, p.id) && !tiles.has(`ext:${x.id}:${p.id}`)).map((p) => ({ x, p })));
    if (panels.length) want.push(sep("sep:ext", "Extension panels"));
    for (const { x, p } of panels) {
      const label = `${x.name}: ${p.title}`;
      want.push({ key: `x:${x.id}:${p.id}`, label, build: () => chip(glyph(icons.puzzle), label, () => ctx.ext?.openPanel(x.id, p.id)) });
    }
    reconcileAdd(want);
  }

  function setEditing(on: boolean) {
    if (!on) {
      tiles.forEach((t) => {
        if (t.input && document.activeElement === t.input) {
          t.input.blur();
          t.commit?.();
        }
      });
    }
    if (!on) endDrag(false);
    editing = on;
    root.classList.toggle("is-editing", on);
    if (editBtn.dataset.on !== String(on)) {
      editBtn.dataset.on = String(on);
      editIcon.innerHTML = on ? icons.check : icons.edit;
      editLabel.textContent = on ? "Done" : "Edit";
    }
    editBtn.title = on ? "Finish editing" : "Edit board";
    editBtn.setAttribute("aria-pressed", String(on));
    hint.setAttribute("aria-hidden", String(!on));
    tiles.forEach((t) => {
      t.fit?.();
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
      editBtn = el("button", "btn wg-edit");
      editBtn.type = "button";
      editBtn.title = "Edit board";
      editIcon = el("span", "wg-edit-icon");
      editIcon.innerHTML = icons.edit;
      editLabel = el("span", "wg-edit-label", "Edit");
      editBtn.append(editIcon, editLabel);
      editBtn.addEventListener("click", () => setEditing(!editing));
      hint = el("p", "wg-hint", "Drag tiles to reorder. Resize or remove from a tile's corner.");
      const headText = el("div", "wg-headtext");
      headText.append(el("h1", "pn-title", "Widgets"), hint);
      head.append(headText, viewBar("widgets", (v) => ctx.go(v)), editBtn, iconButton(icons.puzzle, "Extensions", () => ctx.ext?.showSheet()), iconButton(icons.gear, "Settings", () => ctx.go("prefs")));
      board = el("div", "wg-board");
      empty = el("p", "pn-empty", "The board is empty. Choose Edit to add apps.");
      addBar = el("section", "wg-addbar");
      addBar.setAttribute("aria-label", "Add a widget");
      addMenu = el("div", "wg-add");
      addBar.append(el("h2", "wg-add-title", "Add a widget"), addMenu);
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
      root.append(head, board, empty, addBar, pop);
      boardSig = sigOf(ctx.snap.prefs.widgets);
      ctx.ext?.setDock(dock);
      ctx.ext?.subscribe(extChanged);
      syncAdd();
      const clearStale = () => {
        if (drag && !drag.active) drag = null;
      };
      window.addEventListener("pointerup", clearStale);
      window.addEventListener("pointercancel", clearStale);
      root.addEventListener("pointerdown", (e) => {
        if (!pop.hidden && !pop.contains(e.target as Node) && !(e.target as HTMLElement).closest(".wg-group")) closePop();
      });
    },
    update(snap) {
      ctx.snap = snap;
      const bsig = sigOf(snap.prefs.widgets);
      if (bsig !== boardSig && !drag?.active) {
        boardSig = bsig;
        adopt(snap.prefs.widgets);
      }
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
      if (e.key === "Escape" && drag?.active) return endDrag(false), true;
      if (e.key === "Escape" && !pop.hidden) return closePop(), true;
      if (e.key === "Escape" && editing && !(document.activeElement instanceof HTMLInputElement)) return setEditing(false), true;
      return false;
    },
  };
}
