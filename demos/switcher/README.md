# FormTray demo: Switcher and hotkeys

The keyboard side of FormTray. Double-click `index.html` (file://) or serve this folder with any static server. No backend, no network, no CDN.

## What it shows

The real FormTray window (the views built from `frontend/src`, on the demo engine that ports `formtray-core`) floating over a desktop, opened on the Switcher. Everything here is about reaching and launching apps without the mouse:

- **Hotkeys per platform.** Switch between macOS, Windows and Linux to see each system's default table: the Switcher chord, the last-view chord and one chord per view.
- **Rebind.** Click a chord, press new keys. The engine refuses reserved chords (Spotlight, the system app switcher, Task View and so on) and duplicates with its own messages. "Try a reserved chord" shows a refusal on demand; Default restores one, Defaults restores all.
- **Keystroke strip.** Every chord you press, real or played, appears as keycaps over the desktop with what it did, and the matching row lights up.
- **Keyboard flows.** Five flows press real keys on the real views: quick launch from the Switcher, bringing a running app forward from Stack, a Windows round trip, Apps by number key, Settings and back. They read the current bindings, so rebind a chord and the flow follows.
- **Command line.** `hotkeys`, `hotkey switcher Alt+Q`, `open`, `quit`, `list` with the output of `formtray-cli`.
- **Your files.** Export `prefs.json`, or drop one on the page to load its hotkeys and board.

Nothing is launched for real; running state is simulated in the page and nothing leaves the tab.

## Rebuild

```sh
cd demos/switcher
node ../../frontend/node_modules/vite/bin/vite.js build --config ./vite.config.mjs
```

Type check: `node ../../frontend/node_modules/typescript/bin/tsc -p . --noEmit`. The build is one classic script because browsers refuse module scripts on file://. It writes `index.html`, `assets/` and `apps/` into this folder and touches nothing else.

## Files

| Path | What it is |
|---|---|
| `src/index.html`, `src/main.ts` | The keyboard tools: hotkey table, capture, flows, keystroke strip, command line |
| `src/stage.ts` | The real window on the demo desktop; imports the views, engine, bridge and desktop from `frontend/src` and `demo/src` |
| `src/keys.css` | This demo's few styles; tokens, layers and app styles are the app's own |
| `vite.config.mjs`, `tsconfig.json` | Build |
| `CREDITS.md`, `HASHOUT_LOG.md` | Every asset, and why the code is the way it is |
| `index.html`, `assets/`, `apps/` | The committed build |

The three demos: `../../demo/index.html` (overview), this one, `../widgets/index.html`.
