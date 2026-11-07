# HASHOUT_LOG · demo · formtray

Living log of rationale for the browser demo. Source stays comment-free; read this first, then edit surgically.

Current build version: v0.14.3
Last updated: 2026-11-07 · v0.14.3 the quiet three-demo link row, rebuilt for the version the bundle embeds; v0.14.2 rebuilt for the version the bundle embeds, no demo change; v0.14.1 the real desktop and media; v0.14.0 the demo

---

## Org-navi-map

```
demo/
├── index.html, assets/, apps/   the committed build
├── vite.config.ts               port 5612, host false, one classic script
├── tsconfig.json                type checks demo and frontend sources together
└── src/
    ├── index.html               shell markup, pre-paint theme script
    ├── main.ts                  panes, tabs, hotkeys in the page, drop zone
    ├── engine.ts                port of formtray-core
    ├── bridge.ts                replaces frontend/src/bridge.ts
    ├── console.ts               formtray-cli commands
    ├── files.ts                 reading and saving JSON
    ├── samples.ts               sample FormPortal record
    ├── desktop.ts               menu bar, windows and dock behind the panel
    ├── shots/                   wallpaper and nine window screenshots (see CREDITS.md)
    └── demo.css                 chrome, dark and light tokens, the desktop
```

## vite.config.ts

- refers-to: the post HTML step, iife output
- kind: rationale
- logged: v0.14.0 · 2026-11-07
- Chrome blocks module scripts and CORS-mode stylesheets on file://, so the build emits one IIFE script with `defer`, and the HTML step removes `type="module"` and `crossorigin`. The dynamic import in the original preview bridge disappears because the demo bridge imports the catalog statically.
- refers-to: the transform on frontend/src/ui.ts
- kind: decision
- ui.ts addresses icons as `/apps/<file>`, which cannot resolve on file://. The build rewrites that prefix to `./apps/` in the bundled copy; the source file is not edited.

## src/bridge.ts

- refers-to: the module as a whole
- kind: rationale
- The frontend's own bridge falls back to preview data when there is no Tauri global. The demo main imports this module in its place so the views can run against an engine that keeps state (running, usage, prefs, hotkeys, portal), and `on` is wired to engine events. The views import `../bridge`; a resolveId hook in vite.config.ts sends every `bridge` import made from `frontend/src` to this file, so views, ui.ts and the shell share one module and one engine. The views only use `call`, `on`, `native`, `VIEWS` and types.

## src/engine.ts

- refers-to: Engine.isReleased, readPortal, newer, familyId
- kind: rationale
- Ported line for line from core/src (lib.rs, portal.rs, hotkeys.rs, registry.rs) so the demo refuses and accepts the same inputs: release by `opens` date or a catalogue stable artifact for the platform, installs from the stable channel, `newer` comparing numeric parts. Discovery of apps on disk has no browser equivalent; installed state comes only from the portal record.
- refers-to: appsChanged, build in main.ts
- kind: warning-context
- The views build their cells once and add none mid-session (frontend HASHOUT_LOG). When a date change or an imported catalogue changes which apps are released, main.ts rebuilds the panes in place, like a restart. Plain state changes only emit `state`.

## src/main.ts

- refers-to: the keydown handler
- kind: rationale
- Keys typed inside the demo chrome (`data-demo-ui`) are ignored by the views' handlers, or Enter in the command line would open the selected app. Bound hotkeys are matched in the page with the engine's normalise, so a rebinding can be tried. The Switcher natively commits on modifier release; in the page Enter commits.
- refers-to: refit, --fit
- kind: rationale
- Panel sizes come from app.css per view. The stage scales the panel with CSS `zoom` through one custom property, recomputed on resize and view change only.

## src/demo.css

- refers-to: html[data-theme]
- kind: decision
- The demo defaults to the dark theme the app is designed in. The token sets are repeated under `data-theme` so the choice does not depend on the system appearance; `System` removes the override and the media query in tokens.css applies. The theme attribute is set by an inline script before first paint.
- refers-to: z-index
- kind: rationale
- Only the drop overlay layers, on `--z-overlay`.
- refers-to: z-index in .desktop, .stage-fit, .dw.is-front, .dk
- kind: decision
- logged: v0.14.1 · 2026-11-07
- v0.14.1 also layers the desktop on `--z-base`, the panel (`.stage-fit`) on `--z-raised`, and inside the desktop the front window, menu bar and dock on `--z-raised`. Windows otherwise stack in DOM order, so no new numbers are needed.
- refers-to: .desktop, .dw, .dk, src/desktop.ts
- kind: rationale
- The media pass puts the panel on a real desktop: a Pexels night sky wallpaper, the verified demo screenshots of nine Apache-2.0 Form apps as windows (never the docs hero captures, whose in-window photographs have no verifiable licence), a menu bar and a dock of real family icons. Windows and dock items are created once at mount and only toggle classes (`is-open`, `is-front`, `is-running`, `is-off`) from `sync`, so nothing is rebuilt and nothing flashes. A window opens when its app is running; the front window is the running app with the latest `last`. Images are CSS backgrounds over a reserved colour, plain files, never read for pixels, so they load from file://. FormPortal, FormSkills and FormMCP have no screenshot because their repositories are GPL-3.0; they show only their icon.
- refers-to: .wc-plate and .wg-tile[data-size="l"] custom property --shot
- kind: decision
- The views are the app's own code and are not edited. The Windows plates and large Widgets tiles pick up their screenshot by CSS attribute selectors on `data-label` and `data-app`, which the views already set. Large tiles darken with a gradient and force light text so they read in the light theme too.
- refers-to: .panel under html[data-glass="css"]
- kind: decision
- With a photograph behind it the nearly opaque css glass hid the desktop, so the demo makes the css panel translucent with a backdrop blur, as the native glass looks. The cap on the scale in `refit` is 0.9 so the desktop shows around the panel.
