import { native, type AppState, type Snapshot, type View } from "./bridge";
import { icons } from "./icons";

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

function liveSrc(app: AppState): string {
  if (!app.live_icon) return "";
  if (!native) return `/apps/${app.live_icon}`;
  return document.documentElement.dataset.platform === "windows" ? `http://appicon.localhost/${app.live_icon}` : `appicon://localhost/${app.live_icon}`;
}

export function iconSrc(app: AppState): string {
  return app.icon ? `/apps/${app.icon}` : liveSrc(app);
}

export function iconLightSrc(app: AppState): string {
  return app.icon ? `/apps/${app.icon.replace(/\.webp$/, "")}-light.webp` : "";
}

function initials(app: AppState): string {
  return app.name.replace(/^form\.?/i, "").slice(0, 2);
}

function iconImg(box: HTMLElement, sources: string[], app: AppState, tone = ""): HTMLImageElement {
  const queue = sources.filter(Boolean);
  const img = el("img", tone);
  img.alt = "";
  img.decoding = "async";
  img.draggable = false;
  img.addEventListener("error", () => {
    const next = queue.shift();
    if (next) {
      img.src = next;
      return;
    }
    img.remove();
    if (!box.querySelector("img")) {
      box.classList.add("app-icon-mono");
      box.textContent = initials(app);
    }
  });
  img.src = queue.shift() ?? "";
  return img;
}

function fillIcon(box: HTMLElement, app: AppState): void {
  const dark = iconSrc(app);
  const light = iconLightSrc(app);
  if (light) {
    box.append(iconImg(box, [dark, liveSrc(app), light], app, "ai-dark"), iconImg(box, [light, dark], app, "ai-light"));
  } else {
    box.append(iconImg(box, [dark], app));
  }
}

export function appIcon(app: AppState, size: "s" | "m" | "l"): HTMLSpanElement {
  const box = el("span", `app-icon app-icon-${size}`);
  box.style.setProperty("--hue", app.hue);
  box.dataset.iconApp = app.id;
  const src = iconSrc(app);
  if (src) {
    fillIcon(box, app);
  } else {
    box.classList.add("app-icon-mono");
    box.textContent = initials(app);
  }
  return box;
}

export function appName<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, app: AppState): HTMLElementTagNameMap[K] {
  const node = el(tag, cls, app.name);
  node.dataset.nameApp = app.id;
  return node;
}

const seen = new Map<string, { src: string; name: string }>();

export function syncIdentity(snap: Snapshot): void {
  for (const app of snap.apps) {
    const src = iconSrc(app);
    const prev = seen.get(app.id);
    seen.set(app.id, { src, name: app.name });
    if (!prev) continue;
    if (prev.name !== app.name) {
      document.querySelectorAll<HTMLElement>(`[data-name-app="${app.id}"]`).forEach((n) => {
        n.textContent = app.name;
      });
    }
    if (src && prev.src !== src) {
      const probe = new Image();
      probe.src = src;
      probe
        .decode()
        .then(() => {
          if (seen.get(app.id)?.src !== src) return;
          const light = iconLightSrc(app);
          document.querySelectorAll<HTMLElement>(`[data-icon-app="${app.id}"]`).forEach((box) => {
            const imgs = box.querySelectorAll("img");
            if (imgs.length === (light ? 2 : 1)) {
              imgs.forEach((img) => {
                img.src = light && img.classList.contains("ai-light") ? light : src;
              });
            } else {
              box.classList.remove("app-icon-mono");
              box.textContent = "";
              fillIcon(box, app);
            }
          });
        })
        .catch(() => undefined);
    }
  }
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
