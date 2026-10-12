import type { AppState, Snapshot } from "../bridge";
import { appIcon, el, runDot, sortRecent, visible } from "../ui";
import type { Ctx, ViewModule } from "./types";

export function switcher(): ViewModule {
  let ctx: Ctx;
  let strip: HTMLElement;
  let label: HTMLElement;
  let order: AppState[] = [];
  const cells = new Map<string, HTMLButtonElement>();
  let index = 0;
  let committed = false;

  function candidates(snap: Snapshot): AppState[] {
    const shown = visible(snap.apps);
    const installed = shown.filter((a) => a.installed);
    return sortRecent(installed.length ? installed : shown).slice(0, 9);
  }

  function select(i: number) {
    if (!order.length) return;
    index = (i + order.length) % order.length;
    cells.forEach((cell, id) => cell.classList.toggle("is-selected", id === order[index].id));
    label.textContent = order[index].name;
  }

  function build() {
    order = candidates(ctx.snap);
    const keep = new Set(order.map((a) => a.id));
    for (const [id, cell] of cells) {
      if (!keep.has(id)) {
        cell.remove();
        cells.delete(id);
      }
    }
    for (const app of order) {
      let cell = cells.get(app.id);
      if (!cell) {
        cell = el("button", "sw-cell");
        cell.type = "button";
        cell.dataset.app = app.id;
        cell.append(appIcon(app, "l"), runDot());
        const id = app.id;
        cell.addEventListener("pointerenter", () => select(order.findIndex((a) => a.id === id)));
        cell.addEventListener("click", () => {
          select(order.findIndex((a) => a.id === id));
          commit();
        });
        cells.set(app.id, cell);
      }
      cell.classList.toggle("is-running", app.running);
      cell.setAttribute("aria-label", app.name);
      strip.append(cell);
    }
  }

  function commit() {
    if (committed || !order[index]) return;
    committed = true;
    ctx.open(order[index].id);
  }

  return {
    mount(root, c) {
      ctx = c;
      root.classList.add("v-switcher");
      strip = el("div", "sw-strip");
      strip.setAttribute("role", "listbox");
      label = el("p", "sw-label");
      root.append(strip, label);
      build();
      select(0);
    },
    update(snap) {
      for (const app of snap.apps) cells.get(app.id)?.classList.toggle("is-running", app.running);
    },
    shown(reason) {
      committed = false;
      build();
      select(reason === "switcher" && order.length > 1 ? 1 : 0);
    },
    step(by) {
      select(index + by);
    },
    commit,
    key(e) {
      if (e.key === "Tab") {
        select(index + (e.shiftKey ? -1 : 1));
        return true;
      }
      if (e.key === "ArrowRight") return select(index + 1), true;
      if (e.key === "ArrowLeft") return select(index - 1), true;
      if (e.key === "Enter" || e.key === " ") return commit(), true;
      return false;
    },
  };
}
