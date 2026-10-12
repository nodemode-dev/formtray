import type { AppState } from "../bridge";
import { icons } from "../icons";
import { appIcon, el, runDot } from "../ui";
import type { Ctx, ViewModule } from "./types";

export function stack(): ViewModule {
  let ctx: Ctx;
  let grid: HTMLElement;
  let more: HTMLButtonElement;
  const cells = new Map<string, HTMLButtonElement>();
  let index = 0;

  function pinned(): AppState[] {
    const byId = new Map(ctx.snap.apps.map((a) => [a.id, a]));
    return ctx.snap.prefs.pinned.map((id) => byId.get(id)).filter((a): a is AppState => Boolean(a && !a.hidden));
  }

  function items(): HTMLButtonElement[] {
    return [...grid.querySelectorAll<HTMLButtonElement>(".st-cell")];
  }

  function select(i: number) {
    const list = items();
    if (!list.length) return;
    index = (i + list.length) % list.length;
    list.forEach((b, n) => b.classList.toggle("is-selected", n === index));
  }

  function build() {
    const apps = pinned();
    const keep = new Set(apps.map((a) => a.id));
    for (const [id, cell] of cells) {
      if (!keep.has(id)) {
        cell.remove();
        cells.delete(id);
      }
    }
    for (const app of apps) {
      let cell = cells.get(app.id);
      if (!cell) {
        cell = el("button", "st-cell");
        cell.type = "button";
        const id = app.id;
        cell.append(appIcon(app, "m"), runDot(), el("span", "st-name", app.name));
        cell.addEventListener("click", () => ctx.open(id));
        cells.set(app.id, cell);
      }
      cell.classList.toggle("is-running", app.running);
      cell.classList.toggle("is-missing", !app.installed);
      grid.insertBefore(cell, more);
    }
  }

  return {
    mount(root, c) {
      ctx = c;
      root.classList.add("v-stack");
      const title = el("h1", "st-title", "FormAI");
      grid = el("div", "st-grid");
      more = el("button", "st-cell st-more");
      more.type = "button";
      const ring = el("span", "app-icon app-icon-m st-ring");
      ring.innerHTML = icons.grid;
      more.append(ring, el("span", "st-name", "All Apps"));
      more.addEventListener("click", () => ctx.go("apps"));
      grid.append(more);
      root.append(title, grid, el("span", "st-arrow"));
      build();
    },
    update(snap) {
      for (const app of snap.apps) {
        const cell = cells.get(app.id);
        cell?.classList.toggle("is-running", app.running);
        cell?.classList.toggle("is-missing", !app.installed);
      }
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
        items()[index]?.click();
        return true;
      }
      return false;
    },
  };
}
