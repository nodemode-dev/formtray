# HASHOUT_LOG · demos/switcher · formtray

Living log of rationale for the Switcher and hotkeys demo. Source stays comment-free; read this first, then edit surgically.

Current build version: v0.16.0
Last updated: 2026-11-09 · v0.16.0 data-demo on the demo links, rebuilt for the version the bundle embeds; the app ships this build in its interface; 2026-11-07 · v0.14.3 the demo

---

## Org-navi-map

```
demos/switcher/
├── index.html, assets/, apps/   the committed build
├── vite.config.mjs              port 5613, host false, one classic script
├── tsconfig.json                type checks this folder with demo/src and frontend/src
└── src/
    ├── index.html               shell markup, pre-paint theme script
    ├── stage.ts                 the real window on the desktop
    ├── main.ts                  hotkey table, capture, flows, keystroke strip
    └── keys.css                 this demo's styles
```

## src/stage.ts

- refers-to: the module as a whole
- kind: rationale
- Demo 1's `main.ts` boots on import, so it cannot be reused as a library. This file is its window half (panes, tabs, desktop, hotkeys in the page, theme, drop zone) as a function, importing the engine, bridge, desktop and file reader from `demo/src` by path so there is one engine and one set of shims. Nothing from `demo/` is copied and changed.
- refers-to: the keydown handler
- kind: decision
- A bound hotkey is tested before the open view's own `key`. In the app a global chord beats a view key; in demo 1 the Windows view swallowed Tab and the Switcher chord could not open it on macOS. When the chord is the Switcher's and the Switcher is already open, the chord steps the selection, as holding the modifier and tapping does in the app.

## src/main.ts

- refers-to: press, FLOWS
- kind: rationale
- Flows dispatch genuine `keydown` events on `window`, with `code`, `key` and modifiers, so they take the same path as the visitor's keys: the stage handler, the views' `key` methods, the engine. A flow is therefore a test of the real behaviour as well as a tour, and it follows rebinding because chords are read from `engine.hotkeys()` at play time.
- refers-to: the capture listener
- kind: decision
- Rebinding uses the bridge's `set_hotkey`, so the reserved-chord and duplicate refusals are the engine's own, shown in the status line. A chord needs a modifier other than Shift, as in Settings.
- refers-to: cast, describe
- kind: rationale
- The keystroke strip is one fixed-size element whose keycaps are swapped only when the text changes; it sits over the desktop under the menu bar so it never covers the panel or the dock.

## src/keys.css

- refers-to: the demo link row
- kind: decision
- The quiet three-demo link row (`.demo-links`) is styled in `demo/src/demo.css`, which all three demos load, so the row is one rule set and looks the same in each.

- refers-to: html:not(.is-ready) .demo-dyn
- kind: decision
- Everything built by script (view tabs, the panel, the hotkey rows, flows, the side panel) is hidden until the whole page is built, then shown at once, so nothing pops in and nothing below it shifts. Measured with the layout-shift observer under 4x CPU throttle: 0.
- refers-to: z-index
- kind: rationale
- Only `--z-raised` from `frontend/src/styles/layers.css`.

## vite.config.mjs

- refers-to: filePlugin
- kind: decision
- The same three jobs as demo 1's plugin: point every `bridge` import made from `frontend/src` at the demo bridge, rewrite the `/apps/` icon prefix to `./apps/` in the bundled `ui.ts`, and turn the module script into a deferred classic one.
