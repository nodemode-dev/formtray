# HASHOUT_LOG · frontend · formtray

Living log of comment content and rationale for the interface. Source stays comment-free; read this first, then edit surgically.

Current build version: v0.16.3
Last updated: 2026-11-10 · v0.16.2 the Switcher works again after a failed open; leaving Settings ends a hotkey recording and restores the hotkeys; 2026-11-09 · v0.16.0 the Demos section in Settings and the demo pages in the bundle (vite-demos.ts); 2026-11-03 · v0.9.9 Copyright 2026 NodeAgentc, Inc. and the licence in Settings, About; 2026-10-24 · by nodemode.ai in Settings, About; 2026-10-23 · Preferences' About line says Glass for the macOS 26 material; before it, checks only in the repository, releases through formcompiler, formsculpt fallback icon

---

## Org-navi-map

```
frontend/
├── index.html                 one panel root and the toast
├── vite.config.ts             port 5610, host false, fs allows core/data for preview
├── public/apps/               fallback app icons, 256 px webp, named by family id
└── src/
    ├── main.ts                one pane per view in the panel (prefs alone), activate, the move handshake, keys, events
    ├── bridge.ts              types, invoke and listen, browser preview data
    ├── ui.ts                  el, appIcon, appName, iconSrc, syncIdentity, viewBar, time words, chord words
    ├── icons.ts               inline currentColor svg
    ├── styles/                tokens.css, layers.css, app.css
    └── views/                 switcher, stack, apps, windows, widgets, prefs, types
```

## Table of contents

- [src/main.ts](#main)
- [src/bridge.ts](#bridge)
- [src/ui.ts](#ui)
- [src/views](#views)
- [src/styles/app.css](#css)

---

## src/main.ts {#main}

- refers-to: start (last lines), public/splash.html, public/favicon.png
- kind: rationale
- logged: v0.14.2 · 2026-11-07
- When the panel is native, start() ends by calling `app_ready` once through afterPaint (two frames, 60 ms timer as the fallback because a hidden webview may not run animation frames), after `is-ready` is set and every view is mounted. The shell holds the splash until then and for at least 2.6 s. Settings does not call it. `public/splash.html` is formvis's card with the app name, `favicon.png` (the 256 px app icon from assets/app-icon) and the done hook `formtraySplashDone`; the commented SVG in the reference is not copied.

- refers-to: panes, activate
- kind: rationale
- logged: v0.7.0 · 2026-10-20
- All five views live in one window (`panel`) as sibling panes mounted once at load; Settings keeps its own window with one module. Switching hides one pane and shows another, sets `data-view` on html, and calls `shown`. Before this each view was its own window, and a switch hid one window and mapped another: under Xvfb with openbox and xcompmgr the recording showed a black or empty frame between them, the panel jumping to a new size and place, and the new window never getting keyboard focus, so the next number key went nowhere.
- refers-to: view:show moving, afterPaint, settle, view:placed
- kind: rationale
- When the shell must resize, move or show the window, the event carries `moving`: html gets `is-moving` (panel hidden), the pane swaps, and only after a paint does the page call `settle`, which resizes, places and shows. `view:placed` is followed by two paints before `is-moving` is removed. Without it the recording showed the old view clipped to the new size, the panel moving before resizing, and a white strip. `afterPaint` races two rAFs against a 60 ms timer because a hidden WebKitGTK window may not run rAF; the shell settles on its own after 200 ms in case the call never comes.
- refers-to: current_view on start
- kind: warning-context
- The launch `view:show` can arrive before the listeners are registered, so the page asks the shell which view it is showing once the listeners exist.
- refers-to: holding, keyup
- kind: rationale
- The webview keyup commit is now only a fallback for Wayland, and only when the Switcher was opened by holding its chord. Before, tapping Alt in a Switcher opened from the menu or key 1 opened an app. On X11 the shell polls the modifier instead (src-tauri keys.rs).

## src/bridge.ts {#bridge}

- refers-to: previewSnapshot
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- Without `window.__TAURI__` the page uses preview data built from core/data/apps.json, so the views can be developed and checked in a browser. It is loaded by dynamic import, so the app bundle only carries it as a separate chunk.

## src/views {#views}

### src/views/prefs.ts · NodeAgentc, Inc. and the licence under the About line
- refers-to: src/views/prefs.ts :: credit, section("About", ...)
- kind: decision
- logged: v0.9.9 · 2026-11-03

The launch punch list (2026-11-03): the About of a downloaded app says NodeAgentc, Inc., not nodemode-ai, and lists the licence. The credit paragraph under the About line now reads "Copyright 2026 NodeAgentc, Inc. Apache License 2.0; the LICENSE file is beside the app." (still `translate = false`, still built once in mount()). It is text, not a link: the bridge has no command that opens an address, and a plain anchor opens nothing in the window.

### src/views/prefs.ts · by nodemode.ai under the About line
- refers-to: src/views/prefs.ts :: credit, section("About", ...)
- kind: decision
- logged: v0.9.4 · 2026-10-24

Owner decision of 2026-10-23 for the form family: an app's About carries "by nodemode.ai". Settings' About section already holds the version line, so the credit is a second `pf-hint` paragraph under it, built once in mount() with the other nodes and never touched by update(), and marked `translate = false`. Checked in the preview build in Chromium at 4x CPU and a slow network: the line shows above the FormPortal button, CLS 0, no page error.

### src/views/prefs.ts · the About line's material name
- refers-to: src/views/prefs.ts :: the about text built from info.glass
- kind: rationale
- logged: v0.9.2 · 2026-10-23

The owner's approved rename table (2026-10-23) uses FormTray's own word for Apple's macOS 26 material: the About line says "Glass" where it said "Liquid Glass". The value `info.glass === "liquid"` from the shell is unchanged; "macOS vibrancy", "Windows acrylic" and "solid panels" stay.

- refers-to: every view, update()
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- Nodes are keyed by app id and built once. update() only toggles classes and text, and build() only moves or removes existing nodes (law two).
- refers-to: switcher.ts shown()
- kind: rationale
- The order is computed when the Switcher is shown and not on state updates, so a running-state change never reshuffles the strip mid-cycle. A hotkey launch starts on the second app, as Cmd+Tab does.
- refers-to: switcher.ts commit; main.ts :: ctx.open; views/types.ts :: Ctx.open
- kind: fix
- logged: v0.16.2 · 2026-11-10
- After a failed open the Switcher stayed dead: `commit` set `committed` before `ctx.open` and only `shown()` cleared it, so with the panel still open (a toast says the app is not installed) every later Enter, click or modifier release did nothing. Trigger: no Form app installed (the strip falls back to not-installed apps), or any launch that fails. The app's `ctx.open` now returns a promise that resolves true, or false after the toast when `open_app` fails, and `commit` clears `committed` on false so another pick works. `Ctx.open` is typed `void | Promise<boolean>` so the three demo stages, whose `open` returns nothing, stay valid unchanged; every other caller still ignores the result. Checked: `tsc --noEmit` for frontend, demo, demos/switcher and demos/widgets passes; not run in the app or the preview.
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
- refers-to: prefs.ts :: mount (close button, window blur), shown, finishCapture
- kind: fix
- logged: v0.16.2 · 2026-11-10
- Leaving Settings while a hotkey was being recorded left every global hotkey unregistered: `capture` calls `pause_hotkeys(true)`, and only Escape or a finished chord called `finishCapture`. Trigger: click a hotkey button, then close Settings with its X, click another app, or close it from the taskbar. The Switcher, summon and view hotkeys stayed dead until a restart, and `capturing` stayed set, so a later key press in Settings was saved as that action's chord. Now the close button, a window `blur` and `shown()` each end a capture in progress through `finishCapture` (which re-registers the hotkeys and redraws the list). Checked: `tsc --noEmit` passes; not run in the app (no WebKit on the build host).
- refers-to: widgets.ts wireReorder, reposition, shift, .wg-ph, .wg-hint, .wg-board
- kind: removed-code
- logged: v0.13.0 · 2026-11-06
- The owner could not reorder widgets in v0.12.0. HTML5 drag and drop (draggable, dragstart, dragover) is fragile in the macOS WKWebView and was replaced by pointer events. In edit mode, a press that moves more than 4 px lifts the tile: it follows the pointer by transform while a `.wg-ph` placeholder with the same grid span keeps its slot. The placeholder moves by insertBefore using a 2D reading-order test, with hysteresis (8 px or leaving the tile) so dense-grid reflow cannot make it flip-flop. The board autoscrolls within 40 px of its edges. The drop saves once, only if the order changed. Escape, pointercancel, lost capture or leaving edit mode restore the order. Alt+Arrow moves a focused tile, except during a drag. The dragged tile sits on `--z-drag` above the tool pills. The edit hint moved into the fixed-height header, so view mode no longer keeps an empty band above the board. The board has padding on every side, larger at the bottom.

## src/ui.ts {#ui}

- refers-to: iconSrc, appIcon, iconImg
- kind: rationale
- logged: v0.9.0 · 2026-10-22
- An installed app's own icon (`live_icon`, from the engine's cache through the appicon scheme) comes first, the bundled `/apps/<icon>` second, initials last. If the live image fails to load it falls back to the bundled file, then to initials, inside the same fixed-size box, so nothing moves. In the browser preview a `live_icon` is read from `/apps/`, which lets the swap be exercised without the shell.
- refers-to: appName, syncIdentity, data-icon-app, data-name-app
- kind: rationale
- Law two. Views build their cells once, so a new name or icon after Find Apps Again is patched, not rebuilt: syncIdentity keeps the last src and name per app, changes the text of `[data-name-app]` nodes, and swaps the `src` of `[data-icon-app]` images only after the new image has decoded off-screen, so the old icon shows until the new one is ready. Seeded with the first snapshot in main.ts before the views mount. Verified under Xvfb with the app on one core shared with four busy loops: a fallback icon became the live one, and later a renamed and redrawn app changed name then icon two frames apart, with no blank or shifted frame.
- refers-to: persistent name nodes
- kind: warning-context
- Only cells that live for the session carry `data-name-app`: Apps grid, Stack, Widgets app tiles, Windows cards and Settings rows. Pop-overs and the add menu are rebuilt each time they open, so they read the current name anyway. Titles and aria-labels keep the name from when the cell was built. An app discovered for the first time by a rescan appears in the views after FormTray restarts, because cells are not added mid-session.

## public/apps/ {#apps}

- refers-to: format.png, formcut.png, formdam.png, formdeck.png, formdesign.png, formencoder.png, formlit.png, formmd.svg, formpath.png, formpdf.png, formportal.png, formref.png, formsculpt.png, formvfx.png, formvis.png, formwav.png, formweb.png
- kind: removed-code
- logged: v0.9.0 · 2026-10-22
- The 17 v0.1.0 to v0.8.0 fallback icons (256 px png and one svg), copied from each app's repo at the time, removed because every one differed from the owner's current icon. Replaced by 23 webp files at 256 px with alpha, resized from the owner's 1024 px form-icons.zip with the aspect ratio kept; the zip's `form-md`, `formDAM`, `formMCP` and `formpth` files are named `formmd`, `formdam`, `formmcp` and `formpath` here. formhub is left out until it launches (see core/HASHOUT_LOG.md, apps.json).

- refers-to: ai-dark, ai-light, iconLightSrc, brandMark, .ap-mark
- kind: rationale
- logged: v0.9.9 · 2026-11-06
- The owner's icon pack (35 apps, dark `<id>.webp` and light `<id>-light.webp`, 256 px, 70 files) replaces the 23 earlier files; formranker.webp is gone. An app with an `icon` now renders both images in its fixed box and CSS shows one by `prefers-color-scheme`, the same signal tokens.css uses, so a system appearance change swaps them with no script, no re-render and no flash. The bundled pack icon is preferred over `live_icon`; the live icon is the fallback only when `icon` is empty, or when the pack file fails to load. syncIdentity still patches `src` in place on the existing images. The search bar mark in the Apps view is the FormTray icon in the same pair technique at 26 px, and the old triangle glyph (`icons.launcher`) was unused elsewhere and removed.

- refers-to: .ap-mark, icons.search, brandMark
- kind: removed-code
- logged: v0.12.0 · 2026-11-06
- The owner disliked the FormTray icon as the search mark; it is the magnifying glass glyph (`icons.search`, currentColor, `--ink-faint`) and clicking it focuses the field. `brandMark()` and the `.ap-mark img` light/dark rules had no other user and were removed.

## src/styles/app.css {#css}

- refers-to: .panel
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- With native glass, the panel is a near-clear fill with an inset sheen line, so the system material does the blur and adapts to light and dark. With `data-glass="css"` (Linux) it uses `--glass-solid`, because blur cannot reach the desktop through a transparent webview.

## package.json {#vite-pin}

- refers-to: vite
- kind: rationale
- logged: v0.9.5 · 2026-10-25
- Family rule from `FAMILY_DEV_PLAN.md` v0.4.x Phase 2b (formai_dev sidecar): every frontend installs with zero `npm audit` findings. Vite 8.3.2 carries a `launch-editor` with two command-injection advisories in the dev server (ledger FB-004); 8.3.5 clears them. Dev dependency only, nothing in the shipped bundle changed. Verified: `npm install` then `npm audit` reports 0 vulnerabilities, `npm run typecheck` passes, `vite build` succeeds, and `vite` serves 200 on localhost with no Network address printed.

## extension host 2026-11-07 {#extensions}

- refers-to: src/ext/host-bridge.ts
- kind: decision
- logged: v0.15.0 · 2026-11-07
- The Form Extension Contract kit's host bridge, copied unchanged (NOTICE row). formtray adapts it only from outside, in ext/host.ts.
- refers-to: src/ext/host.ts :: createExtensions, CATALOGUE, BOARD, ACTIONS, change, act, read, loadListing
- kind: decision
- formtray has no document, so `document.read` returns the board (Widgets tiles), the Stack pins, hidden apps, the app list, the view and FormPortal's updates (docs/EXTENSIONS.md has the shape). The commands are formtray's own board and app actions. `document.apply` takes only board commands: each op is applied to a copy of the prefs and the copy is saved once through `set_prefs`, so the call lands whole or not at all; there is no undo history in formtray to group it into (contract-issues.md). Action commands (open, quit, view, rescan, updates) run only through `app.run`. Theme tokens map `--ground --pane --ink --ink-soft --focus --edge-strong --radius-m` onto the contract names, and a `prefers-color-scheme` change calls `setTheme`. `files.open` uses a hidden file input (the iframe click's user activation reaches the parent); `files.save` and `net.fetch` are left out (-32003). Events: `document.changed` from `observe` on every state broadcast and after an extension's own save, `selection.changed` from main.ts activate, `apps.changed` when the running set changes.
- refers-to: src/ext/sheet.ts :: buildSheet, consentCard, dialogCard, trap
- kind: rationale
- The Extensions panel is a glass sheet over the panel window (formtray has no dock), built hidden with the layer before the first paint; rows are keyed by id, patched in place, and only their chips and buttons are rebuilt when state, version, permissions or panels change. Consent and dialog panels use the same card as the group pop-over. Escape is caught in the capture phase by the topmost open sheet or card, so it does not reach main.ts and hide the whole panel.
- refers-to: src/views/widgets.ts :: makeExt, dock, extChanged, adopt, sigOf, boardSig; Tile kind "extension"
- kind: decision
- Contributed dock panels live on the Widgets board as tiles of kind `extension` (id `ext:<extension>:<panel>`, `app` the extension id, `name` the panel id), saved in prefs.widgets like any tile, so they can be resized, moved and removed in Edit mode; the frame stops taking the pointer in Edit mode so drag still works. A tile whose extension is gone or refused moves to `pending` and comes back when it is ready again; a new version remounts the frame in place. The add bar lists extension panels not yet on the board. Because an extension can now change the board, `update` compares a signature of `snap.prefs.widgets` with the last one the view saved or adopted and, when they differ, adopts the list by moving, resizing or removing existing tiles (no rebuild of tiles that stay).
- refers-to: src/views/apps.ts :: cmdWrap, cmdRow, cmdCells
- kind: rationale
- formtray has no command palette; the Apps search is the nearest, so typing there also lists matching extension commands (`Name: Title`) above the grid. Buttons are kept by key between keystrokes.
- refers-to: vite-ext.ts, vite.config.ts plugins
- kind: rationale
- In the browser preview the Vite server answers `GET /api/extensions` and `GET /api/extensions/files/{id}/{version}/{path}` by running `formtray-cli extensions_list --json` and `extension_file` (target/debug, or FORMTRAY_CLI), so the preview uses the same Rust resolver as the app. The config imports `./vite-ext.ts` with its extension (tsconfig `allowImportingTsExtensions`, fine with `noEmit`), so Vite's future native config loader has nothing to warn about. The middleware reads the raw request path (only `?` and `#` split off), not `new URL(...).pathname`: the WHATWG parser folds `..`, `%2e%2e` and `\` before the resolver sees them, so `ui/../manifest.json` was served and `../../etc/passwd` fell through to the page. Now the raw segments reach `extension_file` and are refused with 404 as the kit does.
- refers-to: src/views/widgets.ts :: Extensions header button
- kind: rationale
- The puzzle button is built only when `ctx.ext` exists (the panel window), so the browser demos, which mount the same view without a host, show no dead button.
- refers-to: src/ext/host.ts :: mountPanel, openPanel, starting; src/ext/sheet.ts :: dialogCard
- kind: decision
- Panels open through the kit's `open()` (contract 07:47: consent before the frame exists), not `mount()`. A docked tile keeps the pending `open()` in `starting` so a command with a panel can wait for that frame; a tile disposed before `open()` settles disposes the late frame. `dialogCard` awaits its mount and closes itself when `open()` gives no frame.

## In-app demos {#demos}

- refers-to: src/demos.ts, src/views/prefs.ts :: the Demos section, styles/app.css :: .pf-demos, .pf-demo
- kind: decision
- logged: v0.16.0 · 2026-11-09
- formtray has no start page and no document. Its home surface for things that are not the board is Settings, so the three demos are a Demos section there, after General: one card per demo (`data-demo` = overview, switcher, widgets) with an inline currentColor SVG preview, the title and one line, and a note that the demo is a sample, launches nothing and leaves the person's apps and settings alone. A card calls `open_demo {id}`; the shell opens the demo in its own window. The tray menu has the same three items under Demos (src-tauri HASHOUT_LOG).
- refers-to: vite-demos.ts, vite.config.ts plugins
- kind: rationale
- A FormTray demo is the real views on `demo/src/engine.ts`, the TypeScript port of formtray-core, over a desktop of sample apps. Running that inside the real panel would swap the bridge under live state; a separate window on the committed demo builds shows exactly the browser demo and is sandboxed by construction: the page's bridge is the demo engine, it never calls Tauri, and the `demo-*` windows are in no capability, so they could not invoke a command if they tried. Its only storage is the demo's own `formtray-demo-*` localStorage keys, which the app does not use. `vite-demos.ts` emits `demos/{overview,switcher,widgets}.html` and one shared `demos/assets/` (the three scripts and stylesheets, the wallpaper and nine screenshots once, identical in all three demos, checked byte for byte at build), and points the icons at the app's own `/apps/` pack (`../apps/`), so no media file is shipped twice. Every rewrite throws if its target string is missing, so a demo rebuilt in a new shape fails the app build instead of shipping a broken page. The dev server answers the same paths from the same map.
- refers-to: bridge.ts :: open_demo in the preview branch; demo/src/bridge.ts :: open_demo
- kind: decision
- The browser preview opens `/demos/{id}.html` in a new tab. The browser demos mount the same Settings view, so their bridge answers `open_demo` by following the page's own demo link (`.demo-links a[data-demo]`), which is right on file://, in the repository and in the app's copies.
