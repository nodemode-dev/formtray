import type { AppState } from "../bridge";
import { icons } from "../icons";
import { appIcon, appName, el, iconButton, runningFor, sortRecent, viewBar } from "../ui";
import type { Ctx, ViewModule } from "./types";

export function windowsView(): ViewModule {
  let ctx: Ctx;
  let grid: HTMLElement;
  let empty: HTMLElement;
  const cards = new Map<string, { card: HTMLElement; meta: HTMLElement; quit: HTMLButtonElement }>();
  let armed: string | null = null;
  let armTimer = 0;
  let index = 0;

  function disarm() {
    if (armed) cards.get(armed)?.quit.classList.remove("is-armed");
    armed = null;
    window.clearTimeout(armTimer);
  }

  function make(app: AppState) {
    const card = el("article", "wc-card");
    card.style.setProperty("--hue", app.hue);
    card.tabIndex = -1;
    const plate = el("button", "wc-plate");
    plate.type = "button";
    plate.append(appIcon(app, "l"));
    plate.setAttribute("aria-label", `Bring ${app.name} forward`);
    const id = app.id;
    plate.addEventListener("click", () => ctx.open(id));
    const name = appName("h3", "wc-name", app);
    const meta = el("p", "wc-meta");
    const acts = el("div", "wc-acts");
    const quit = iconButton(icons.power, `Quit ${app.name}`, () => {
      if (armed !== id) {
        disarm();
        armed = id;
        quit.classList.add("is-armed");
        quit.title = `Click again to quit ${app.name}`;
        armTimer = window.setTimeout(disarm, 3000);
        return;
      }
      disarm();
      ctx.quit(id);
    }, "wc-quit");
    acts.append(iconButton(icons.enter, `Bring ${app.name} forward`, () => ctx.open(id)), quit);
    card.append(plate, name, meta, acts);
    return { card, meta, quit };
  }

  function build() {
    const running = sortRecent(ctx.snap.apps.filter((a) => a.running && !a.hidden));
    const keep = new Set(running.map((a) => a.id));
    for (const [id, c] of cards) {
      if (!keep.has(id)) {
        c.card.remove();
        cards.delete(id);
      }
    }
    for (const app of running) {
      let c = cards.get(app.id);
      if (!c) {
        c = make(app);
        cards.set(app.id, c);
      }
      c.meta.textContent = runningFor(app.since);
      grid.append(c.card);
    }
    empty.hidden = running.length > 0;
    select(Math.min(index, Math.max(0, running.length - 1)));
  }

  function select(i: number) {
    const list = [...cards.values()].map((c) => c.card).filter((c) => c.isConnected);
    list.forEach((c) => c.classList.remove("is-selected"));
    if (!list.length) return;
    index = (i + list.length) % list.length;
    list[index].classList.add("is-selected");
  }

  return {
    mount(root, c) {
      ctx = c;
      root.classList.add("v-windows");
      const head = el("header", "pn-head");
      head.setAttribute("data-tauri-drag-region", "");
      head.append(el("h1", "pn-title", "Open Form apps"), viewBar("windows", (v) => ctx.go(v)), iconButton(icons.gear, "Settings", () => ctx.go("prefs")));
      grid = el("div", "wc-grid");
      empty = el("p", "pn-empty", "No Form apps are open. Press 3 for Apps to open one.");
      root.append(head, grid, empty);
      build();
    },
    update(snap) {
      ctx.snap = snap;
      build();
    },
    shown() {
      disarm();
      index = 0;
      build();
    },
    key(e) {
      const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4, Tab: e.shiftKey ? -1 : 1 };
      if (moves[e.key] !== undefined) return select(index + moves[e.key]), true;
      const card = [...cards.entries()].find(([, c]) => c.card.classList.contains("is-selected"));
      if (!card) return false;
      if (e.key === "Enter") return ctx.open(card[0]), true;
      if ((e.key === "q" || e.key === "Q") && (e.metaKey || e.ctrlKey)) return card[1].quit.click(), true;
      return false;
    },
  };
}
