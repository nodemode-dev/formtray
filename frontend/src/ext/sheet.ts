import { icons } from "../icons";
import { el, iconButton } from "../ui";
import { PERMISSION_WORDS, type ExtensionRecord, type Frame } from "./host-bridge";
import type { ExtState } from "./host";

const SOURCES: Record<string, string> = { catalogue: "Catalogue", sideload: "File", development: "Development" };
const STATES: Record<ExtState, string> = { ready: "Ready", "needs-permission": "Needs Permission", refused: "Refused" };
const EMPTY = "No extensions yet. Find them in FormPortal or make one with form.ext.";

export interface SheetActions {
  state(ext: ExtensionRecord): ExtState;
  open(id: string, panel: string): void;
  allow(id: string): void;
  reload(): void;
  manage(): void;
}

export interface Sheet {
  show(): void;
  hide(): void;
  render(list: ExtensionRecord[]): void;
}

type Row = { node: HTMLElement; name: HTMLElement; ver: HTMLElement; src: HTMLElement; st: HTMLElement; desc: HTMLElement; reason: HTMLElement; path: HTMLElement; chips: HTMLElement; actions: HTMLElement; sig: string };

function setText(node: HTMLElement, text: string) {
  if (node.textContent !== text) node.textContent = text;
  const hide = !text;
  if (node.hidden !== hide) node.hidden = hide;
}

function trap(node: HTMLElement, cancel: () => void): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !node.isConnected || node.hidden) return;
    const open = node.parentElement?.querySelectorAll(":scope > .ext-sheet:not([hidden]), :scope > .ext-scrim");
    if (!open || open[open.length - 1] !== node) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    cancel();
  };
  window.addEventListener("keydown", onKey, true);
  return () => window.removeEventListener("keydown", onKey, true);
}

export function buildSheet(layer: HTMLElement, act: SheetActions): Sheet {
  const sheet = el("section", "ext-sheet");
  sheet.hidden = true;
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", "Extensions");
  const head = el("header", "ext-head");
  const reload = el("button", "btn ext-btn", "Reload");
  reload.type = "button";
  reload.addEventListener("click", () => act.reload());
  const manage = el("button", "btn ext-btn", "Manage in FormPortal");
  manage.type = "button";
  manage.addEventListener("click", () => act.manage());
  const close = iconButton(icons.close, "Close extensions", () => hide());
  head.append(el("h2", "ext-title", "Extensions"), reload, manage, close);
  const list = el("div", "ext-list");
  const empty = el("div", "ext-empty");
  const emptyManage = el("button", "btn ext-btn", "Manage in FormPortal");
  emptyManage.type = "button";
  emptyManage.addEventListener("click", () => act.manage());
  empty.append(el("p", "", EMPTY), emptyManage);
  const foot = el("p", "ext-foot", "form.ext's Run in App adds an extension from a folder; it shows here as Development, with its folder.");
  sheet.append(head, list, empty, foot);
  trap(sheet, () => hide());
  layer.append(sheet);
  const rows = new Map<string, Row>();

  function hide() {
    sheet.hidden = true;
  }

  function makeRow(id: string): Row {
    const node = el("article", "ext-row");
    node.dataset.id = id;
    const main = el("div", "ext-main");
    const line = el("div", "ext-line");
    const name = el("h3", "ext-name");
    const ver = el("span", "ext-ver");
    const src = el("span", "ext-src");
    const st = el("span", "ext-state");
    line.append(name, ver, src, st);
    const desc = el("p", "ext-desc");
    const reason = el("p", "ext-reason");
    const path = el("p", "ext-path");
    const chips = el("div", "ext-chips");
    main.append(line, desc, reason, path, chips);
    const actions = el("div", "ext-actions");
    node.append(main, actions);
    return { node, name, ver, src, st, desc, reason, path, chips, actions, sig: "" };
  }

  function patch(row: Row, ext: ExtensionRecord) {
    const state = act.state(ext);
    setText(row.name, ext.name);
    setText(row.ver, ext.version);
    setText(row.src, SOURCES[ext.source] ?? ext.source);
    setText(row.st, STATES[state]);
    if (row.st.dataset.state !== state) row.st.dataset.state = state;
    setText(row.desc, ext.description ?? "");
    setText(row.reason, state === "refused" ? `Refused: ${ext.reason ?? ""}` : "");
    setText(row.path, ext.source === "development" ? ext.path ?? "" : "");
    const sig = JSON.stringify([state, ext.version, ext.permissions, ext.panels]);
    if (row.sig === sig) return;
    row.sig = sig;
    row.chips.replaceChildren(
      ...ext.permissions.map((p) => {
        const c = el("span", "ext-chip", p);
        c.title = PERMISSION_WORDS[p] ?? p;
        return c;
      }),
    );
    const buttons: HTMLButtonElement[] = [];
    if (state !== "refused") {
      for (const p of ext.panels) {
        const b = el("button", "btn ext-btn", ext.panels.length > 1 ? `Open ${p.title}` : "Open");
        b.type = "button";
        b.addEventListener("click", () => act.open(ext.id, p.id));
        buttons.push(b);
      }
      if (state === "needs-permission") {
        const b = el("button", "btn ext-btn", "Allow...");
        b.type = "button";
        b.addEventListener("click", () => act.allow(ext.id));
        buttons.push(b);
      }
    }
    row.actions.replaceChildren(...buttons);
  }

  function render(exts: ExtensionRecord[]) {
    const keep = new Set(exts.map((e) => e.id));
    for (const [id, row] of rows) {
      if (!keep.has(id)) {
        row.node.remove();
        rows.delete(id);
      }
    }
    let prev: Element | null = null;
    for (const ext of exts) {
      let row = rows.get(ext.id);
      if (!row) {
        row = makeRow(ext.id);
        rows.set(ext.id, row);
      }
      patch(row, ext);
      const at: Element | null = prev ? prev.nextElementSibling : list.firstElementChild;
      if (row.node !== at) list.insertBefore(row.node, at);
      prev = row.node;
    }
    const none = exts.length === 0;
    if (empty.hidden !== !none) empty.hidden = !none;
    if (list.hidden !== none) list.hidden = none;
  }

  return {
    show() {
      sheet.hidden = false;
      close.focus();
    },
    hide,
    render,
  };
}

function scrim(layer: HTMLElement, label: string): { scrim: HTMLElement; card: HTMLElement } {
  const s = el("div", "ext-scrim");
  s.setAttribute("role", "dialog");
  s.setAttribute("aria-modal", "true");
  s.setAttribute("aria-label", label);
  const card = el("div", "ext-card");
  s.append(card);
  layer.append(s);
  return { scrim: s, card };
}

export function consentCard(layer: HTMLElement, ext: ExtensionRecord): Promise<boolean> {
  return new Promise((resolve) => {
    const { scrim: s, card } = scrim(layer, `Allow ${ext.name}`);
    const list = el("ul", "ext-perms");
    for (const p of ext.permissions) list.append(el("li", "", PERMISSION_WORDS[p] ?? p));
    const row = el("div", "ext-card-actions");
    const later = el("button", "btn ext-btn", "Not Now");
    later.type = "button";
    const allow = el("button", "btn ext-btn is-primary", "Allow");
    allow.type = "button";
    let untrap: () => void = () => undefined;
    const done = (ok: boolean) => {
      untrap();
      s.remove();
      resolve(ok);
    };
    later.addEventListener("click", () => done(false));
    allow.addEventListener("click", () => done(true));
    row.append(later, allow);
    card.append(el("h2", "ext-card-title", `Allow ${ext.name}?`), el("p", "ext-card-text", `${ext.name} ${ext.version} asks to:`), list, row);
    untrap = trap(s, () => done(false));
    allow.focus();
  });
}

export async function dialogCard(layer: HTMLElement, ext: ExtensionRecord, title: string, mount: (box: HTMLElement) => Promise<Frame | null>): Promise<Frame | null> {
  const { scrim: s, card } = scrim(layer, `${ext.name}: ${title}`);
  card.classList.add("ext-card-panel");
  const head = el("div", "ext-card-head");
  const box = el("div", "ext-card-box");
  let frame: Frame | null = null;
  let untrap: () => void = () => undefined;
  const close = () => {
    untrap();
    frame?.dispose();
    s.remove();
  };
  const closeBtn = iconButton(icons.close, "Close", close);
  head.append(el("h2", "ext-card-title", `${ext.name}: ${title}`), closeBtn);
  card.append(head, box);
  untrap = trap(s, close);
  frame = await mount(box);
  if (!frame) {
    close();
    return null;
  }
  closeBtn.focus();
  return frame;
}
