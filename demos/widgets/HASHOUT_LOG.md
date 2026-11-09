# HASHOUT_LOG · demos/widgets · formtray

Living log of rationale for the Widgets and layout demo. Source stays comment-free; read this first, then edit surgically.

Current build version: v0.16.0
Last updated: 2026-11-09 · v0.16.0 data-demo on the demo links, rebuilt for the version the bundle embeds; the app ships this build in its interface; 2026-11-07 · v0.14.3 the demo

---

## Org-navi-map

```
demos/widgets/
├── index.html, assets/, apps/   the committed build
├── vite.config.mjs              port 5614, host false, one classic script
├── tsconfig.json                type checks this folder with demo/src and frontend/src
└── src/
    ├── index.html               shell markup, pre-paint theme script
    ├── stage.ts                 the real window on the desktop
    ├── main.ts                  the workday layouts, view switch, summary
    └── layout.css               this demo's styles
```

## src/stage.ts

- refers-to: rebuildBoard, boardSig, knownBoard
- kind: warning-context
- The Widgets view builds its tiles once at mount and reconciles only apps that appear or vanish (frontend HASHOUT_LOG), so a board written to prefs from outside the view, such as a layout from this demo or an imported `prefs.json`, is not drawn. Saves made by the view itself go through `ctx.savePrefs`, which records the board signature first; a state event with a different signature came from outside, and only the Widgets pane is mounted again in place. The panes are not otherwise rebuilt.
- refers-to: the module as a whole
- kind: rationale
- The window half of demo 1's `main.ts` as a function, importing the engine, bridge, desktop and file reader from `demo/src` by path, so there is one engine and one set of shims.

## src/main.ts

- refers-to: LAYOUTS, apply
- kind: rationale
- The four layouts are ordinary prefs: tiles with kinds, sizes, groups and the updates tile, plus the set of apps that are running. `apply` writes prefs through `set_prefs`, quits the running apps the layout does not want and opens the ones it does through `open_app`, so Stack and Windows are arranged by the same commands a visitor uses and counts and recents move as they would. Only apps that the sample record installs are used, so no tile is a dead one. An app is never both a tile and a group member in one layout.
- refers-to: SEEN
- kind: decision
- The first visit opens on the 09:00 board. Later visits keep whatever the visitor left, because the engine already stores prefs.
- refers-to: sync
- kind: rationale
- The board summary is derived from the snapshot on every state event and compared with each layout's signature, so the pressed time follows edits made in Edit mode and says "Your own board" once the board differs.

## src/layout.css

- refers-to: the demo link row
- kind: decision
- The quiet three-demo link row (`.demo-links`) is styled in `demo/src/demo.css`, which all three demos load, so the row is one rule set and looks the same in each.

- refers-to: html:not(.is-ready) .demo-dyn
- kind: decision
- Everything built by script is hidden until the page is complete, then shown at once; the layout-shift observer under 4x CPU throttle reads 0.

## Deliberate omission

- refers-to: accent
- kind: decision
- The focus table mentions accent. FormTray has no accent setting: tiles and glass take each app's own hue, and the demo offers the app's real Theme choice instead.
