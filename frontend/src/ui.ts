import type { AppState, View } from "./bridge";
import { icons } from "./icons";

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

export function appIcon(app: AppState, size: "s" | "m" | "l"): HTMLSpanElement {
  const box = el("span", `app-icon app-icon-${size}`);
  box.style.setProperty("--hue", app.hue);
  if (app.icon) {
    const img = el("img");
    img.src = `/apps/${app.icon}`;
    img.alt = "";
    img.decoding = "async";
    img.draggable = false;
    box.append(img);
  } else {
    box.classList.add("app-icon-mono");
    box.textContent = app.name.replace(/^Form\.?/, "").slice(0, 2);
  }
  return box;
}

export function runDot(): HTMLSpanElement {
  return el("span", "run-dot");
}

export function sortRecent(apps: AppState[]): AppState[] {
  return [...apps].sort((a, b) => b.last - a.last || Number(b.running) - Number(a.running) || a.name.localeCompare(b.name));
}

export function visible(apps: AppState[]): AppState[] {
  return apps.filter((a) => !a.hidden);
}

export function ago(seconds: number): string {
  if (!seconds) return "";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}

export function runningFor(since: number): string {
  if (!since) return "Running";
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - since);
  if (diff < 60) return "Running, just opened";
  if (diff < 3600) return `Running for ${Math.floor(diff / 60)} min`;
  return `Running for ${Math.floor(diff / 3600)} h ${Math.floor((diff % 3600) / 60)} min`;
}

const VIEW_META: [View, string, string][] = [
  ["switcher", "Switcher", icons.viewSwitcher],
  ["stack", "Stack", icons.viewStack],
  ["apps", "Apps", icons.viewApps],
  ["windows", "Windows", icons.viewWindows],
  ["widgets", "Widgets", icons.viewWidgets],
];

export function viewBar(current: View, go: (v: View) => void): HTMLElement {
  const bar = el("nav", "view-bar");
  bar.setAttribute("aria-label", "Views");
  VIEW_META.forEach(([id, label, glyph], i) => {
    const b = el("button", "icon-btn view-btn");
    b.type = "button";
    b.innerHTML = glyph;
    b.title = `${label} (${i + 1})`;
    b.setAttribute("aria-label", label);
    if (id === current) b.setAttribute("aria-current", "true");
    b.addEventListener("click", () => go(id));
    bar.append(b);
  });
  return bar;
}

export function iconButton(glyph: string, label: string, onClick: () => void, cls = ""): HTMLButtonElement {
  const b = el("button", `icon-btn ${cls}`.trim());
  b.type = "button";
  b.innerHTML = glyph;
  b.title = label;
  b.setAttribute("aria-label", label);
  b.addEventListener("click", onClick);
  return b;
}

export function prettyChord(chord: string, platform: string): string {
  const mac = platform === "macos";
  const names: Record<string, string> = mac
    ? { control: "Control", alt: "Option", super: "Command", shift: "Shift" }
    : { control: "Ctrl", alt: "Alt", super: platform === "windows" ? "Win" : "Super", shift: "Shift" };
  return chord
    .split("+")
    .map((p) => {
      const k = p.trim();
      const low = k.toLowerCase();
      if (names[low]) return names[low];
      if (k.startsWith("Digit")) return k.slice(5);
      if (k.startsWith("Key")) return k.slice(3);
      if (k === "Backquote") return "`";
      return k;
    })
    .join(" + ");
}
