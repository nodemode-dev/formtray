import type { AppState, Snapshot } from "./bridge";

const WINDOWS = ["formlit", "formvfx", "formdeck", "formencoder", "formpdf", "formmd", "formwav", "formcut", "formvis"];

const DOCK: [string, string][] = [
  ["formvis", "FormVis"],
  ["formlit", "FormLit"],
  ["formcut", "FormCut"],
  ["formvfx", "FormVFX"],
  ["formencoder", "FormEncoder"],
  ["formwav", "FormWav"],
  ["formpdf", "FormPDF"],
  ["formdeck", "FormDeck"],
  ["formmd", "form.md"],
  ["formmcp", "FormMCP"],
  ["formskills", "FormSkills"],
  ["formportal", "FormPortal"],
];

function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text) node.textContent = text;
  return node;
}

function iconBox(id: string): HTMLElement {
  const box = make("span", "app-icon");
  const dark = make("img", "ai-dark");
  const light = make("img", "ai-light");
  for (const img of [dark, light]) {
    img.alt = "";
    img.decoding = "async";
    img.draggable = false;
  }
  dark.src = `./apps/${id}.webp`;
  light.src = `./apps/${id}-light.webp`;
  box.append(dark, light);
  return box;
}

function clock(now: number): string {
  const d = new Date(now * 1000);
  const day = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${day}  ${time}`;
}

export interface Desktop {
  sync(snap: Snapshot, now: number): void;
}

export function mountDesktop(host: HTMLElement, open: (id: string) => void): Desktop {
  const bar = make("div", "dt-bar");
  const mark = make("span", "dt-mark");
  mark.append(iconBox("formtray"));
  const active = make("span", "dt-active", "FormTray");
  const when = make("span", "dt-when");
  bar.append(mark, active, when);

  const wins = new Map<string, HTMLElement>();
  for (const id of WINDOWS) {
    const win = make("div", "dw");
    win.dataset.app = id;
    win.addEventListener("click", () => open(id));
    wins.set(id, win);
  }

  const dock = make("nav", "dk");
  dock.setAttribute("aria-label", "Dock");
  const items = new Map<string, HTMLButtonElement>();
  for (const [id, name] of DOCK) {
    const item = make("button", "dk-item");
    item.type = "button";
    item.dataset.app = id;
    item.title = name;
    item.setAttribute("aria-label", name);
    item.append(iconBox(id), make("i", "dk-dot"));
    item.addEventListener("click", () => open(id));
    items.set(id, item);
    dock.append(item);
  }

  host.append(bar, ...wins.values(), dock);

  function frontOf(apps: AppState[]): AppState | undefined {
    let best: AppState | undefined;
    for (const app of apps) {
      if (!wins.has(app.id) || !app.running || app.hidden) continue;
      if (!best || app.last > best.last) best = app;
    }
    return best;
  }

  return {
    sync(snap, now) {
      const byId = new Map(snap.apps.map((a) => [a.id, a]));
      const front = frontOf(snap.apps);
      for (const [id, win] of wins) {
        const app = byId.get(id);
        win.classList.toggle("is-open", !!app && app.running && !app.hidden);
        win.classList.toggle("is-front", front?.id === id);
      }
      for (const [id, item] of items) {
        const app = byId.get(id);
        item.classList.toggle("is-running", !!app && app.running);
        item.classList.toggle("is-off", !app || !app.installed);
      }
      const name = front?.name ?? "FormTray";
      if (active.textContent !== name) active.textContent = name;
      const text = clock(now);
      if (when.textContent !== text) when.textContent = text;
    },
  };
}
