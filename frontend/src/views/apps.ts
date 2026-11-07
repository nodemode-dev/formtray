import type { AppState } from "../bridge";
import { icons } from "../icons";
import { appIcon, appName, el, iconButton, runDot, viewBar, visible } from "../ui";
import type { Ctx, ViewModule } from "./types";

const COLS = 7;

export function apps(): ViewModule {
  let ctx: Ctx;
  let search: HTMLInputElement;
  let pills: HTMLElement;
  let recentRow: HTMLElement;
  let recentWrap: HTMLElement;
  let grid: HTMLElement;
  let empty: HTMLElement;
  const gridCells = new Map<string, HTMLButtonElement>();
  const recentCells = new Map<string, HTMLButtonElement>();
  const cmdCells = new Map<string, HTMLButtonElement>();
  let cmdWrap: HTMLElement;
  let cmdRow: HTMLElement;
  let category = "all";
  let index = 0;

  function cell(app: AppState): HTMLButtonElement {
    const b = el("button", "ap-cell");
    b.type = "button";
    b.dataset.app = app.id;
    b.append(appIcon(app, "m"), runDot(), appName("span", "ap-name", app));
    b.title = app.alt_of ? `${app.name} · instead of ${app.alt_of}` : app.name;
    const id = app.id;
    b.addEventListener("click", () => ctx.open(id));
    b.addEventListener("pointermove", () => {
      const list = shownCells();
      const n = list.indexOf(b);
      if (n >= 0 && n !== index) select(n);
    });
    return b;
  }

  function sync(b: HTMLButtonElement, app: AppState) {
    b.classList.toggle("is-running", app.running);
    b.classList.toggle("is-missing", !app.installed);
  }

  function shownCells(): HTMLButtonElement[] {
    return [...grid.children].filter((n): n is HTMLButtonElement => n instanceof HTMLButtonElement && !n.hidden);
  }

  function select(i: number) {
    const list = shownCells();
    gridCells.forEach((b) => b.classList.remove("is-selected"));
    if (!list.length) return;
    index = Math.max(0, Math.min(list.length - 1, i));
    list[index].classList.add("is-selected");
  }

  function filter() {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const app of ctx.snap.apps) {
      const b = gridCells.get(app.id);
      if (!b) continue;
      const hit = !app.hidden && (category === "all" || app.category === category) && (!q || `${app.name} ${app.alt_of} ${app.id}`.toLowerCase().includes(q));
      b.hidden = !hit;
      if (hit) shown++;
    }
    const hits = q
      ? (ctx.ext?.list() ?? [])
          .filter((x) => x.state === "ready")
          .flatMap((x) => x.commands.map((c) => ({ x, c })))
          .filter(({ x, c }) => `${x.name} ${c.title} ${c.id}`.toLowerCase().includes(q))
      : [];
    const keep = new Set(hits.map(({ x, c }) => `${x.id}:${c.id}`));
    for (const [k, b] of cmdCells) {
      if (!keep.has(k)) {
        b.remove();
        cmdCells.delete(k);
      }
    }
    for (const { x, c } of hits) {
      const k = `${x.id}:${c.id}`;
      let b = cmdCells.get(k);
      if (!b) {
        b = el("button", "pill ap-cmd", `${x.name}: ${c.title}`);
        b.type = "button";
        const [id, cmd] = [x.id, c.id];
        b.addEventListener("click", () => {
          ctx.ext?.run(id, cmd).catch((e) => ctx.toast(String((e as Error).message ?? e)));
        });
        cmdCells.set(k, b);
      }
      cmdRow.append(b);
    }
    cmdWrap.hidden = hits.length === 0;
    empty.hidden = shown > 0 || hits.length > 0;
    recentWrap.hidden = Boolean(q) || category !== "all" || recentRow.childElementCount === 0;
    select(0);
  }

  function buildRecent() {
    const recent = visible(ctx.snap.apps)
      .filter((a) => a.last > 0)
      .sort((a, b) => b.last - a.last)
      .slice(0, COLS);
    const keep = new Set(recent.map((a) => a.id));
    for (const [id, b] of recentCells) {
      if (!keep.has(id)) {
        b.remove();
        recentCells.delete(id);
      }
    }
    for (const app of recent) {
      let b = recentCells.get(app.id);
      if (!b) {
        b = cell(app);
        recentCells.set(app.id, b);
      }
      sync(b, app);
      recentRow.append(b);
    }
  }

  return {
    mount(root, c) {
      ctx = c;
      root.classList.add("v-apps");
      const head = el("header", "ap-head");
      head.setAttribute("data-tauri-drag-region", "");
      const mark = el("span", "ap-mark");
      mark.innerHTML = icons.search;
      const glass = mark.firstElementChild as SVGElement;
      glass.setAttribute("width", "26");
      glass.setAttribute("height", "26");
      mark.addEventListener("click", () => search.focus());
      search = el("input", "ap-search");
      search.type = "search";
      search.placeholder = "Search apps";
      search.setAttribute("aria-label", "Search apps");
      search.spellcheck = false;
      search.addEventListener("input", filter);
      head.append(mark, search, viewBar("apps", (v) => ctx.go(v)), iconButton(icons.gear, "Settings", () => ctx.go("prefs")));

      pills = el("div", "ap-pills");
      pills.setAttribute("role", "tablist");
      for (const [id, name] of [["all", "All"], ...ctx.snap.categories.map((k) => [k.id, k.name])]) {
        const p = el("button", "pill", name);
        p.type = "button";
        p.dataset.cat = id;
        p.setAttribute("role", "tab");
        p.setAttribute("aria-selected", String(id === category));
        p.addEventListener("click", () => {
          category = id;
          pills.querySelectorAll(".pill").forEach((n) => n.setAttribute("aria-selected", String((n as HTMLElement).dataset.cat === id)));
          filter();
        });
        pills.append(p);
      }

      recentWrap = el("section", "ap-recent");
      recentRow = el("div", "ap-row");
      recentWrap.append(el("h2", "ap-section", "Recent"), recentRow);

      const body = el("div", "ap-body");
      grid = el("div", "ap-grid");
      empty = el("p", "ap-empty", "No Form app matches that.");
      empty.hidden = true;
      for (const app of [...ctx.snap.apps].sort((a, b) => a.name.localeCompare(b.name))) {
        const b = cell(app);
        sync(b, app);
        gridCells.set(app.id, b);
        grid.append(b);
      }
      cmdWrap = el("section", "ap-cmds");
      cmdWrap.hidden = true;
      cmdRow = el("div", "ap-cmd-row");
      cmdWrap.append(el("h2", "ap-section", "Extension commands"), cmdRow);
      body.append(cmdWrap, recentWrap, el("h2", "ap-section", "All apps"), grid, empty);
      root.append(head, pills, body);
      buildRecent();
      filter();
    },
    update(snap) {
      for (const app of snap.apps) {
        const g = gridCells.get(app.id);
        if (g) sync(g, app);
        const r = recentCells.get(app.id);
        if (r) sync(r, app);
      }
    },
    shown() {
      search.value = "";
      buildRecent();
      filter();
      search.focus();
    },
    key(e) {
      const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS };
      if (moves[e.key] !== undefined && !(document.activeElement === search && (e.key === "ArrowLeft" || e.key === "ArrowRight") && search.value)) {
        select(index + moves[e.key]);
        return true;
      }
      if (e.key === "Enter") {
        shownCells()[index]?.click();
        return true;
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && document.activeElement !== search && !/^[1-5]$/.test(e.key)) {
        search.focus();
      }
      return false;
    },
  };
}
