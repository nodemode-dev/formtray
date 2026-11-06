import type { AppState } from "../bridge";
import { icons } from "../icons";
import { appIcon, appName, el, iconButton, runDot, viewBar } from "../ui";
import type { Ctx, ViewModule } from "./types";

export function stack(): ViewModule {
  let ctx: Ctx;
  let grid: HTMLElement;
  let more: HTMLButtonElement;
  let empty: HTMLElement;
  const cells = new Map<string, { cell: HTMLElement; open: HTMLButtonElement; quit: HTMLButtonElement }>();
  let index = 0;

  function running(): AppState[] {
    return ctx.snap.apps.filter((a) => a.running && !a.hidden).sort((a, b) => a.since - b.since);
  }

  function items(): HTMLElement[] {
    return [...grid.querySelectorAll<HTMLElement>(".st-cell")];
  }

  function select(i: number) {
    const list = items();
    if (!list.length) return;
    index = (i + list.length) % list.length;
    list.forEach((b, n) => b.classList.toggle("is-selected", n === index));
  }

  function build() {
    const apps = running();
    const keep = new Set(apps.map((a) => a.id));
    for (const [id, entry] of cells) {
      if (!keep.has(id)) {
        entry.cell.remove();
        cells.delete(id);
      }
    }
    let ref: ChildNode | null = grid.firstElementChild;
    for (const app of apps) {
      let entry = cells.get(app.id);
      if (!entry) {
        const id = app.id;
        const cell = el("div", "st-cell");
        const open = el("button", "st-open");
        open.type = "button";
        open.append(appIcon(app, "m"), runDot(), appName("span", "st-name", app));
        open.addEventListener("click", () => ctx.open(id));
        const quit = iconButton(icons.power, `Quit ${app.name}`, () => ctx.quit(id), "st-quit");
        cell.append(open, quit);
        entry = { cell, open, quit };
        cells.set(app.id, entry);
      }
      entry.cell.classList.toggle("is-running", app.running);
      entry.cell.classList.toggle("is-missing", !app.installed);
      entry.open.setAttribute("aria-label", app.name);
      entry.quit.setAttribute("aria-label", `Quit ${app.name}`);
      entry.quit.title = `Quit ${app.name}`;
      if (entry.cell === ref) ref = ref.nextSibling;
      else grid.insertBefore(entry.cell, ref);
    }
    empty.classList.toggle("is-off", apps.length > 0);
  }

  return {
    mount(root, c) {
      ctx = c;
      root.classList.add("v-stack");
      const head = el("header", "st-head");
      head.setAttribute("data-tauri-drag-region", "");
      head.append(el("h1", "pn-title", "Open now"), viewBar("stack", (v) => ctx.go(v)), iconButton(icons.gear, "Settings", () => ctx.go("prefs")));
      grid = el("div", "st-grid");
      more = el("button", "st-cell st-more");
      more.type = "button";
      const ring = el("span", "app-icon app-icon-m st-ring");
      ring.innerHTML = icons.grid;
      more.append(ring, el("span", "st-name", "All Apps"));
      more.addEventListener("click", () => ctx.go("apps"));
      empty = el("div", "st-empty");
      empty.append(el("p", "st-empty-line", "No Form apps are open"), el("p", "st-empty-hint", "Apps you open from FormTray appear here."));
      grid.append(more, empty);
      root.append(head, grid, el("span", "st-arrow"));
      build();
    },
    update(snap) {
      ctx.snap = snap;
      const prev = index >= 0 ? items()[index] : undefined;
      const focused = document.activeElement;
      build();
      if (index >= 0) {
        const at = prev ? items().indexOf(prev) : -1;
        select(at >= 0 ? at : Math.min(index, items().length - 1));
      }
      if (focused instanceof HTMLElement && focused !== document.activeElement && grid.contains(focused)) focused.focus({ preventScroll: true });
    },
    shown() {
      build();
      items().forEach((b) => b.classList.remove("is-selected"));
      index = -1;
    },
    key(e) {
      const cols = 3;
      const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
      if (moves[e.key] !== undefined) {
        select(index < 0 ? 0 : index + moves[e.key]);
        return true;
      }
      if (e.key === "Enter" && index >= 0) {
        const target = items()[index];
        (target?.querySelector<HTMLElement>(".st-open") ?? target)?.click();
        return true;
      }
      return false;
    },
  };
}
