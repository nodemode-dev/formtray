# FormTray demo: Widgets and layout

The board side of FormTray. Double-click `index.html` (file://) or serve this folder with any static server. No backend, no network, no CDN.

## What it shows

The real FormTray window (the views built from `frontend/src`, on the demo engine that ports `formtray-core`) floating over a desktop, opened on the Widgets board of a morning. A workday timeline on the right drives it:

- **09:00 Read and plan, 11:00 Photo day, 14:00 Edit and mix, 17:30 Wrap up.** Each time applies a whole board through the app's own `set_prefs` (tile order, sizes, groups, the FormPortal updates tile) and opens and quits apps through `open_app` and `quit_app`, so the board, Stack, Windows and the windows on the desktop all follow.
- **Look at it in** Widgets, Stack or Windows to see the same workday from each view.
- **Shape the board.** Edit mode is the app's own: drag to reorder, resize between small, medium and large, remove, add apps, a group or the updates tile, rename and open groups, Alt with an arrow key to move a tile from the keyboard. A live line counts tiles by size, groups and open apps and says when the board is your own.
- **Theme** in the top bar: dark, light or system.
- **Your board.** Export `prefs.json`, or drop one on the page to load its board.

The app tiles take each app's own hue and large tiles show the app's window; the app has no separate accent setting, so the demo does not invent one. Nothing is launched for real; running state is simulated in the page and nothing leaves the tab.

## Rebuild

```sh
cd demos/widgets
node ../../frontend/node_modules/vite/bin/vite.js build --config ./vite.config.mjs
```

Type check: `node ../../frontend/node_modules/typescript/bin/tsc -p . --noEmit`. The build is one classic script because browsers refuse module scripts on file://. It writes `index.html`, `assets/` and `apps/` into this folder and touches nothing else.

## Files

| Path | What it is |
|---|---|
| `src/index.html`, `src/main.ts` | The workday timeline, view switch, board summary, file in and out |
| `src/stage.ts` | The real window on the demo desktop; rebuilds the board pane when a layout is applied from outside it |
| `src/layout.css` | This demo's few styles; tokens, layers and app styles are the app's own |
| `vite.config.mjs`, `tsconfig.json` | Build |
| `CREDITS.md`, `HASHOUT_LOG.md` | Every asset, and why the code is the way it is |
| `index.html`, `assets/`, `apps/` | The committed build |

The three demos: `../../demo/index.html` (overview), `../switcher/index.html`, this one.
