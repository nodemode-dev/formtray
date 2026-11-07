import { call, engine, onUiLog, type Snapshot } from "../../../demo/src/bridge";
import { mountConsole } from "../../../demo/src/console";
import { ACTIONS, normalise, type Platform } from "../../../demo/src/engine";
import { download } from "../../../demo/src/files";
import { prettyChord } from "../../../frontend/src/ui";
import { chordOf, mountStage } from "./stage";

const NAMES: Record<string, string> = {
  switcher: "Switcher",
  summon: "Last view",
  "view-switcher": "Switcher view",
  "view-stack": "Stack view",
  "view-apps": "Apps view",
  "view-windows": "Windows view",
  "view-widgets": "Widgets view",
};

const RESERVED: Record<Platform, string> = { macos: "Super+Space", windows: "Alt+Tab", linux: "Super+Tab" };
const KEY_NAMES: Record<string, string> = { ArrowLeft: "Left", ArrowRight: "Right", ArrowUp: "Up", ArrowDown: "Down", Escape: "Esc", Backquote: "`", Comma: ",", Space: "Space" };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

function shorten(label: string): string {
  return label.replace("Control", "Ctrl").replace("Option", "Opt").replace("Command", "Cmd");
}

function capLabels(chord: string, platform: string): string[] {
  return prettyChord(chord, platform).split(" + ").map(shorten);
}

function caps(labels: string[]): HTMLElement[] {
  return labels.map((l) => el("kbd", "kc", l));
}

function keyOf(code: string): string {
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code === "Space") return " ";
  if (code === "Backquote") return "`";
  if (code === "Comma") return ",";
  return code;
}

function press(chord: string): void {
  const parts = chord.split("+");
  const code = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase());
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      code,
      key: keyOf(code),
      ctrlKey: mods.includes("control"),
      shiftKey: mods.includes("shift"),
      altKey: mods.includes("alt"),
      metaKey: mods.includes("super"),
      bubbles: true,
      cancelable: true,
    }),
  );
}

interface Step {
  chord: () => string;
  labels: () => string[];
}

const hot = (action: string): Step => ({ chord: () => engine.hotkeys()[action], labels: () => capLabels(engine.hotkeys()[action], engine.platform) });
const plain = (code: string, label?: string): Step => ({ chord: () => code, labels: () => [label ?? KEY_NAMES[code] ?? keyOf(code)] });
const settings: Step = {
  chord: () => (engine.platform === "macos" ? "Super+Comma" : "Control+Comma"),
  labels: () => [engine.platform === "macos" ? "Cmd" : "Ctrl", ","],
};

interface Flow {
  title: string;
  note: string;
  steps: Step[];
}

const FLOWS: Flow[] = [
  { title: "Quick launch", note: "Hold the Switcher chord, tap to the app before the last one, release to open it.", steps: [hot("switcher"), plain("Tab"), plain("Enter")] },
  { title: "Who is running", note: "Open Stack from the keyboard and bring the third app forward.", steps: [hot("view-stack"), plain("ArrowRight"), plain("ArrowRight"), plain("Enter")] },
  { title: "Windows round trip", note: "Jump to Windows, cycle with Tab, Enter focuses the card.", steps: [hot("view-windows"), plain("Tab"), plain("Tab"), plain("Enter")] },
  { title: "Apps by number", note: "A bare 3 opens Apps; arrows move over the grid; Enter launches.", steps: [plain("Digit3", "3"), plain("ArrowRight"), plain("ArrowDown"), plain("Enter")] },
  { title: "Settings and back", note: "The preferences shortcut, then Esc returns to the view you left.", steps: [settings, plain("Escape")] },
];

async function start() {
  const stage = await mountStage("switcher");
  const html = document.documentElement;

  const cl = mountConsole($("cl-log"), $("cl-form") as HTMLFormElement, $("cl-input") as HTMLInputElement, $("cl-chips"));
  onUiLog((line) => cl.print(`window: ${line}`, "ui"));
  cl.print("The same engine the app uses. Try: hotkeys, hotkey switcher Alt+Q, open formpdf.", "ui");

  const list = $("kb-list");
  const status = $("kb-status");
  const rows = new Map<string, { row: HTMLElement; chord: HTMLButtonElement; reset: HTMLButtonElement; text: string }>();
  let capturing: string | null = null;

  function say(text: string) {
    if (status.textContent !== text) status.textContent = text;
  }

  for (const action of Object.keys(NAMES)) {
    const row = el("div", "kb-row");
    const chord = el("button", "kb-chord");
    chord.type = "button";
    chord.title = "Change this hotkey";
    const reset = el("button", "kb-default", "Default");
    reset.type = "button";
    reset.hidden = true;
    chord.addEventListener("click", () => {
      capturing = action;
      chord.classList.add("is-capturing");
      chord.replaceChildren(document.createTextNode("Press the new keys, or Esc"));
      rows.get(action)!.text = "";
      say(`Rebinding ${NAMES[action]}.`);
    });
    reset.addEventListener("click", () => {
      call("set_hotkey", { action, chord: "" })
        .then(() => say(`${NAMES[action]} is back to its default.`))
        .catch((e) => say(String(e)));
    });
    row.append(el("span", "kb-name", NAMES[action]), chord, reset);
    rows.set(action, { row, chord, reset, text: "" });
    list.append(row);
  }

  function renderKeys(snap: Snapshot) {
    for (const [action, r] of rows) {
      const chord = snap.hotkeys[action];
      const labels = capLabels(chord, snap.platform);
      const text = labels.join(" ");
      if (r.text !== text && capturing !== action) {
        r.chord.replaceChildren(...caps(labels));
        r.text = text;
      }
      r.chord.setAttribute("aria-label", `${NAMES[action]}: ${prettyChord(chord, snap.platform)}`);
      r.reset.hidden = !snap.prefs.hotkeys[action];
    }
    document.querySelectorAll<HTMLButtonElement>("#seg-platform .seg-b").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.platform === snap.platform)));
  }

  engine.subscribe((name, payload) => {
    if (name === "state") renderKeys(payload as Snapshot);
  });
  renderKeys(engine.snapshot());

  document.querySelectorAll<HTMLButtonElement>("#seg-platform .seg-b").forEach((b) =>
    b.addEventListener("click", () => {
      engine.setPlatform(b.dataset.platform as Platform);
      say(`Showing the ${b.textContent} defaults.`);
    }),
  );

  $("kb-try").addEventListener("click", () => {
    const chord = RESERVED[engine.platform];
    call("set_hotkey", { action: "summon", chord })
      .then(() => say(`${chord} was accepted.`))
      .catch((e) => say(`${String(e)}. Refused, as the app does.`));
  });
  $("kb-reset").addEventListener("click", async () => {
    for (const action of ACTIONS) await call("set_hotkey", { action, chord: "" });
    say("Every hotkey is back to this system's default.");
  });

  const castKeys = $("cast-keys");
  const castWhat = $("cast-what");
  let castText = "";
  let hitTimer = 0;

  function cast(labels: string[], what: string) {
    const text = labels.join(" ");
    if (text !== castText) {
      castKeys.replaceChildren(...caps(labels));
      castText = text;
    }
    if (castWhat.textContent !== what) castWhat.textContent = what;
  }

  function describe(e: KeyboardEvent): { labels: string[]; what: string } | null {
    if (/^(Shift|Control|Alt|Meta)/.test(e.code)) return null;
    const mac = engine.platform === "macos";
    const labels: string[] = [];
    if (e.ctrlKey) labels.push("Ctrl");
    if (e.shiftKey) labels.push("Shift");
    if (e.altKey) labels.push(mac ? "Opt" : "Alt");
    if (e.metaKey) labels.push(mac ? "Cmd" : engine.platform === "windows" ? "Win" : "Super");
    labels.push(KEY_NAMES[e.code] ?? (e.code.startsWith("Digit") || e.code.startsWith("Key") ? keyOf(e.code).toUpperCase() : e.code));
    const wanted = normalise(chordOf(e)).toLowerCase();
    for (const [action, bound] of Object.entries(engine.hotkeys())) {
      if (normalise(bound).toLowerCase() === wanted) {
        rows.get(action)?.row.classList.add("is-hit");
        window.clearTimeout(hitTimer);
        hitTimer = window.setTimeout(() => rows.forEach((r) => r.row.classList.remove("is-hit")), 900);
        return { labels, what: NAMES[action] };
      }
    }
    if (e.key === "Enter") return { labels, what: "Open the selected app" };
    if (e.key === "Escape") return { labels, what: "Back" };
    if (/^Arrow|^Tab$/.test(e.key)) return { labels, what: "Move the selection" };
    if (/^[1-5]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) return { labels, what: `Open ${["Switcher", "Stack", "Apps", "Windows", "Widgets"][Number(e.key) - 1]}` };
    if ((e.ctrlKey || e.metaKey) && e.key === ",") return { labels, what: "Settings" };
    return { labels, what: "Not a FormTray key" };
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (capturing) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const action = capturing;
        const r = rows.get(action)!;
        if (e.key === "Escape") {
          capturing = null;
          r.chord.classList.remove("is-capturing");
          renderKeys(engine.snapshot());
          say("Left as it was.");
          return;
        }
        if (/^(Shift|Control|Alt|Meta)/.test(e.code)) return;
        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
          say(engine.platform === "macos" ? "Hold Control, Option or Command with the key." : "Hold Ctrl, Alt or the Windows key with the key.");
          return;
        }
        const chord = chordOf(e);
        capturing = null;
        r.chord.classList.remove("is-capturing");
        call("set_hotkey", { action, chord })
          .then(() => say(`${NAMES[action]} is now ${prettyChord(chord, engine.platform)}.`))
          .catch((err) => say(`${String(err)}. Kept the old chord.`))
          .finally(() => renderKeys(engine.snapshot()));
        return;
      }
      const from = e.target as Element | null;
      if (from?.closest?.("input, select, textarea")) return;
      if (from?.closest?.("[data-demo-ui] button") && (e.key === "Enter" || e.key === " ")) return;
      const d = describe(e);
      if (d) cast(d.labels, d.what);
    },
    true,
  );

  const flowList = $("fl-list");
  let playing = false;
  const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

  for (const flow of FLOWS) {
    const card = el("button", "fl");
    card.type = "button";
    const head = el("span", "fl-title");
    head.append(el("span", "", flow.title), el("span", "fl-play", "Play"));
    const steps = el("span", "fl-steps");
    const stepNodes = flow.steps.map(() => el("span", "fl-step"));
    steps.append(...stepNodes);
    card.append(head, el("span", "fl-note", flow.note), steps);
    flowList.append(card);

    const paint = () => {
      flow.steps.forEach((s, i) => {
        const caps = s.labels().map((l) => el("kbd", "kc", l));
        stepNodes[i].replaceChildren(...caps);
        stepNodes[i].className = "fl-step";
      });
    };
    paint();
    engine.subscribe((n) => {
      if (n === "state" && !playing) paint();
    });

    card.addEventListener("click", async () => {
      if (playing) return;
      playing = true;
      card.classList.add("is-running");
      stepNodes.forEach((n) => n.querySelectorAll(".kc").forEach((k) => k.classList.remove("is-done")));
      if (stage.active() !== "widgets") stage.activate("widgets", "switch");
      await sleep(450);
      for (let i = 0; i < flow.steps.length; i++) {
        stepNodes[i].querySelectorAll(".kc").forEach((k) => k.classList.add("is-done"));
        press(flow.steps[i].chord());
        await sleep(i === flow.steps.length - 1 ? 900 : 800);
      }
      card.classList.remove("is-running");
      playing = false;
    });
  }

  const file = $<HTMLInputElement>("file");
  $("pick").addEventListener("click", () => file.click());
  file.addEventListener("change", () => {
    const picked = [...(file.files ?? [])];
    file.value = "";
    if (picked.length) void stage.ingest(picked);
  });
  $("export").addEventListener("click", () => download("prefs.json", engine.exportPrefs()));
  $("reset").addEventListener("click", () => {
    engine.reset();
    say("Demo reset.");
    stage.toast("Demo reset.");
  });

  html.classList.add("is-ready");
}

start().catch((e) => {
  document.documentElement.classList.add("is-ready");
  document.getElementById("toast")!.textContent = String(e);
});
