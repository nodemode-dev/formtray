# FormTray demo

A browser demo of FormTray that runs offline. Double-click `index.html` (file://) or serve this folder with any static server. No backend, no Tauri, no network, no CDN: every script, style and icon is in this folder.

## What it shows

The six real views (Switcher, Stack, Apps, Windows, Widgets, Settings) built from `frontend/src`, with the app's own tokens, layers, styles, icon module and 35-app icon pack, over the repo's own catalog `core/data/apps.json`. Only `frontend/src/bridge.ts` is replaced: `src/engine.ts` is a TypeScript port of `formtray-core` that answers the same commands the Tauri shell does.

The panel floats over a desktop: a night sky photograph, a menu bar, and a dock of the family's real icons. Each Form app that is running shows its window (a screenshot of that app's own demo) on the desktop; open or quit an app from any view or from the dock and its window comes and goes. The Windows view and the large Widgets tiles show the same screenshots. Where every image came from is in `CREDITS.md`.

It works with zero files (a built-in sample FormPortal record, with a few apps not installed and two updates waiting), and on your own files:

- **FormPortal files.** Drop or open `installed.json` and `catalog/apps.json` from FormPortal's data folder. Installed state, paths, names, the Updates tile and the release gate follow them, using the engine's `family_id`, `newer` and platform rules. "Save sample" downloads the built-in pair so you can edit them and drop them back.
- **Launch, focus and quit.** Open an app from any view; it appears in Stack and Windows, its count and recents change, and Quit takes two clicks as in the app. An app that is not installed is refused with the engine's message.
- **Command line.** The panel on the right runs `formtray cli` commands with the same output as `formtray-cli`: `list`, `list --json`, `open`, `quit`, `hotkeys`, `hotkey`, `updates`, `where`. Actions in the window are echoed there.
- **Hotkeys.** Settings lists the platform's default hotkeys; rebind one by clicking it and pressing keys. Reserved chords (Spotlight, the app switcher) and duplicates are refused as the engine does. Press a bound chord in the page and the view opens. Switch the system between macOS, Windows and Linux to see each table.
- **Widgets.** Reorder tiles by pointer, resize, group, add and remove in Edit mode; changes are saved.
- **Settings in and out.** Export `prefs.json`, or drop one in. State is kept in this browser's localStorage when it is available and works without it.
- **Release waves.** "Pretend today is" moves the clock; apps appear as their `opens` date passes, and the views reload as FormTray does on a restart.

Nothing is launched for real: running state is simulated in the page. Nothing leaves the tab.

## In the app

FormTray ships this demo and the two in `demos/` inside the app. Open them from Settings (the Demos section) or from the menu bar menu (Demos). Each opens in its own window, on the same sample engine as here: it launches nothing and leaves your apps and settings alone. Close the window to leave the demo.

## Rebuild

```sh
cd frontend
npm ci
npm run build:demo
```

This type checks `demo/` and writes `index.html`, `assets/` and `apps/` into this folder. The build is a single classic script because browsers refuse module scripts on file://. Dev server: `npx vite --config ../demo/vite.config.ts` (port 5612).

## Files

| Path | What it is |
|---|---|
| `src/index.html`, `src/main.ts` | The shell: view tabs, panes, hotkeys in the page, drop zone |
| `src/engine.ts` | The core port: registry, release waves, portal reader, usage, running, hotkeys |
| `src/bridge.ts` | The stand-in for `frontend/src/bridge.ts` |
| `src/console.ts`, `src/files.ts`, `src/samples.ts` | Command line, file reading, sample FormPortal files |
| `src/demo.css` | Demo chrome and the dark and light token sets |
| `vite.config.ts`, `tsconfig.json` | Build |
| `index.html`, `assets/`, `apps/` | The committed build |
