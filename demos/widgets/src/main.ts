import { call, engine, type Prefs, type Snapshot, type Tile } from "../../../demo/src/bridge";
import { download } from "../../../demo/src/files";
import { appIcon, el } from "../../../frontend/src/ui";
import { mountStage } from "./stage";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const app = (id: string, size: Tile["size"]): Tile => ({ kind: "app", id, app: id, name: "", apps: [], size });
const group = (id: string, name: string, apps: string[], size: Tile["size"]): Tile => ({ kind: "group", id, app: "", name, apps, size });
const updates = (size: Tile["size"]): Tile => ({ kind: "updates", id: "updates", app: "", name: "", apps: [], size });

interface Layout {
  id: string;
  time: string;
  name: string;
  note: string;
  tiles: Tile[];
  running: string[];
}

const LAYOUTS: Layout[] = [
  {
    id: "plan",
    time: "09:00",
    name: "Read and plan",
    note: "Notes and the week's PDFs up front, updates in view.",
    tiles: [app("formmd", "l"), app("formpdf", "m"), updates("m"), app("formdeck", "m"), group("group-today", "Photo desk", ["formlit", "formvis"], "m"), app("formcut", "s"), app("formwav", "s"), app("formvfx", "s"), app("formmcp", "m")],
    running: ["formmd", "formpdf"],
  },
  {
    id: "shoot",
    time: "11:00",
    name: "Photo day",
    note: "Library and editor large, delivery tucked in a group.",
    tiles: [app("formlit", "l"), app("formvis", "l"), group("group-delivery", "Delivery", ["formpdf", "formdeck"], "m"), app("formmd", "m"), updates("m"), app("formcut", "s"), app("formwav", "s"), app("formvfx", "s"), app("formmcp", "s")],
    running: ["formlit", "formvis"],
  },
  {
    id: "edit",
    time: "14:00",
    name: "Edit and mix",
    note: "Cut and sound large, effects beside them, stills on call.",
    tiles: [app("formcut", "l"), app("formwav", "l"), app("formvfx", "m"), group("group-stills", "Stills", ["formlit", "formvis"], "m"), app("formmd", "m"), updates("s"), app("formpdf", "s"), app("formdeck", "s"), app("formmcp", "s")],
    running: ["formcut", "formwav", "formvfx"],
  },
  {
    id: "wrap",
    time: "17:30",
    name: "Wrap up",
    note: "Deck and handout up, the archive grouped, updates large.",
    tiles: [app("formdeck", "l"), app("formpdf", "m"), app("formmd", "m"), updates("l"), group("group-archive", "Archive", ["formcut", "formwav", "formvis"], "m"), app("formlit", "s"), app("formvfx", "s"), app("formmcp", "s")],
    running: ["formdeck", "formpdf", "formportal"],
  },
];

const SEEN = "formtray-widgets-demo-seen";

function members(tiles: Tile[]): string[] {
  const ids: string[] = [];
  for (const t of tiles) for (const id of t.kind === "group" ? t.apps : t.kind === "app" ? [t.app] : []) if (!ids.includes(id)) ids.push(id);
  return ids;
}

function signature(tiles: Tile[]): string {
  return tiles.map((t) => `${t.id}:${t.size}:${t.apps.join("+")}`).join(",");
}

async function apply(layout: Layout): Promise<void> {
  const prefs: Prefs = { ...engine.snapshot().prefs, widgets: layout.tiles.map((t) => ({ ...t, apps: [...t.apps] })), pinned: members(layout.tiles) };
  await call("set_prefs", { prefs });
  const want = new Set(layout.running);
  for (const a of engine.snapshot().apps) if (a.running && !want.has(a.id)) await call("quit_app", { id: a.id });
  for (const id of layout.running) if (!engine.snapshot().apps.find((a) => a.id === id)?.running) await call("open_app", { id });
}

async function start() {
  let first = true;
  try {
    first = window.localStorage.getItem(SEEN) === null;
    window.localStorage.setItem(SEEN, "1");
  } catch {
    first = true;
  }
  if (first) await apply(LAYOUTS[0]);

  const stage = await mountStage("widgets");
  const html = document.documentElement;

  const list = $("wd-list");
  const cards = new Map<string, HTMLButtonElement>();
  const byId = (id: string) => engine.snapshot().apps.find((a) => a.id === id);

  for (const layout of LAYOUTS) {
    const card = el("button", "wd");
    card.type = "button";
    const strip = el("span", "wd-strip");
    for (const id of members(layout.tiles)) {
      const a = byId(id);
      if (a) strip.append(appIcon(a, "s"));
    }
    card.append(el("span", "wd-time", layout.time), el("span", "wd-name", layout.name), el("span", "wd-note", layout.note), strip);
    card.addEventListener("click", async () => {
      if (stage.active() !== "widgets" && stage.active() !== "stack" && stage.active() !== "windows") stage.activate("widgets", "switch");
      await apply(layout);
      stage.toast(`${layout.time} ${layout.name}: ${layout.tiles.length} tiles, ${layout.running.length} apps open.`);
    });
    cards.set(layout.id, card);
    list.append(card);
  }

  const sum = $("board-sum");
  function sync(snap: Snapshot) {
    const sig = signature(snap.prefs.widgets);
    const hit = LAYOUTS.find((l) => signature(l.tiles) === sig);
    cards.forEach((c, id) => c.setAttribute("aria-pressed", String(hit?.id === id)));
    const t = snap.prefs.widgets;
    const n = (s: Tile["size"]) => t.filter((x) => x.size === s).length;
    const groups = t.filter((x) => x.kind === "group").length;
    const open = snap.apps.filter((a) => a.running && !a.hidden).length;
    const text = `${hit ? `${hit.time} ${hit.name}` : "Your own board"}: ${t.length} tiles (${n("l")} large, ${n("m")} medium, ${n("s")} small), ${groups} group${groups === 1 ? "" : "s"}, ${open} app${open === 1 ? "" : "s"} open.`;
    if (sum.textContent !== text) sum.textContent = text;
    document.querySelectorAll<HTMLButtonElement>("#seg-view .seg-b").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === stage.active())));
  }

  engine.subscribe((name, payload) => {
    if (name === "state") sync(payload as Snapshot);
  });
  sync(engine.snapshot());

  document.querySelectorAll<HTMLButtonElement>("#seg-view .seg-b").forEach((b) =>
    b.addEventListener("click", () => {
      stage.activate(b.dataset.view as "widgets", "switch");
      sync(engine.snapshot());
    }),
  );
  document.querySelectorAll<HTMLButtonElement>("#demo-views .demo-tab").forEach((b) => b.addEventListener("click", () => window.setTimeout(() => sync(engine.snapshot()), 0)));

  function editing(): boolean {
    return document.querySelector<HTMLElement>(".wg-edit")?.dataset.on === "true";
  }

  function toggleEdit() {
    if (stage.active() !== "widgets") stage.activate("widgets", "switch");
    document.querySelector<HTMLButtonElement>(".wg-edit")?.click();
  }

  $("edit").addEventListener("click", toggleEdit);
  $("add-group").addEventListener("click", () => {
    if (stage.active() !== "widgets") stage.activate("widgets", "switch");
    if (!editing()) document.querySelector<HTMLButtonElement>(".wg-edit")?.click();
    const chip = [...document.querySelectorAll<HTMLButtonElement>(".wg-add-item")].find((b) => b.textContent?.includes("New group"));
    chip?.click();
  });

  const file = $<HTMLInputElement>("file");
  $("pick").addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    const picked = [...(file.files ?? [])];
    file.value = "";
    if (picked.length) void stage.ingest(picked);
  });
  $("export").addEventListener("click", () => download("prefs.json", engine.exportPrefs()));
  $("reset").addEventListener("click", async () => {
    engine.reset();
    await apply(LAYOUTS[0]);
    stage.toast("Demo reset to the 09:00 board.");
  });

  html.classList.add("is-ready");
}

start().catch((e) => {
  document.documentElement.classList.add("is-ready");
  document.getElementById("toast")!.textContent = String(e);
});
