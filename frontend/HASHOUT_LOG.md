# HASHOUT_LOG · frontend · formai

Living log of comment content and rationale for the interface. Source stays comment-free; read this first, then edit surgically.

Current build version: v0.5.0
Last updated: 2026-10-12 · group and updates tiles, hotkey rebinding

---

## Org-navi-map

```
frontend/
├── index.html                 one panel root and the toast
├── vite.config.ts             port 5610, host false, fs allows core/data for preview
├── public/apps/               app icons, 256 px
└── src/
    ├── main.ts                picks the view from ?view=, the shared keys, events
    ├── bridge.ts              types, invoke and listen, browser preview data
    ├── ui.ts                  el, appIcon, viewBar, time words, chord words
    ├── icons.ts               inline currentColor svg
    ├── styles/                tokens.css, layers.css, app.css
    └── views/                 switcher, stack, apps, windows, widgets, prefs, types
```

## Table of contents

- [src/bridge.ts](#bridge)
- [src/views](#views)
- [src/styles/app.css](#css)

---

## src/bridge.ts {#bridge}

- refers-to: previewSnapshot
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- Without `window.__TAURI__` the page uses preview data built from core/data/apps.json, so the views can be developed and checked in a browser. It is loaded by dynamic import, so the app bundle only carries it as a separate chunk.

## src/views {#views}

- refers-to: every view, update()
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- Nodes are keyed by app id and built once. update() only toggles classes and text, and build() only moves or removes existing nodes (law two).
- refers-to: switcher.ts shown()
- kind: rationale
- The order is computed when the Switcher is shown and not on state updates, so a running-state change never reshuffles the strip mid-cycle. A hotkey launch starts on the second app, as Cmd+Tab does.
- refers-to: windows.ts quit
- kind: rationale
- Quit needs two clicks within 3 s; the button turns red when armed.
- refers-to: widgets.ts
- kind: todo
- logged: v0.5.0 · 2026-10-12
- There are app, group and updates tiles. Recent-files and quick-action tiles still need the apps to expose recents and a new-project entry point (see DEV_PLAN Phase 6).
- refers-to: widgets.ts tiles map
- kind: rationale
- An app tile is keyed by its app id, a group by `group-<base36 time>` and the updates tile by `updates`; `order()` reads the keys back from `data-id` in DOM order. Changing a group rebuilds only that tile's mini-icon row, and opening a group fills only the pop-over list.
- refers-to: prefs.ts renderKeys
- kind: rationale
- The hotkey list is rebuilt only when a signature of the effective hotkeys, the overrides, the registration issues and the capture state changes. Before v0.5.0 it was rebuilt on every state broadcast, which happens once a second while Settings is open.
- refers-to: prefs.ts onCapture
- kind: rationale
- It listens in the capture phase and stops propagation, so the shared keys in main.ts (1 to 5, Esc) do not act while a chord is being recorded. The chord is built from `e.code`, so Option on macOS does not turn the letter into a symbol.

## src/styles/app.css {#css}

- refers-to: .panel
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- With native glass, the panel is a near-clear fill with an inset sheen line, so the system material does the blur and adapts to light and dark. With `data-glass="css"` (Linux) it uses `--glass-solid`, because blur cannot reach the desktop through a transparent webview.
