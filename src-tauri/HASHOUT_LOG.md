# HASHOUT_LOG · shell · formai

Living log of comment content and rationale for the Tauri shell. Source stays comment-free; read this first, then edit surgically.

Current build version: v0.5.0
Last updated: 2026-10-12 · set_hotkey and pause_hotkeys

---

## Org-navi-map

```
src-tauri/
├── tauri.conf.json            six hidden windows, withGlobalTauri, macOSPrivateApi, bundle
├── capabilities/default.json  core plus hide and drag for the six windows
├── icons/                     app icon set and tray.png (menu bar template)
└── src/
    ├── main.rs                calls formai_shell::run
    ├── lib.rs                 state, commands, show and place, hotkeys, tray, run loop
    ├── glass.rs               Liquid Glass, vibrancy, acrylic, css
    └── keys.rs                is the Switcher's modifier still held
```

## Table of contents

- [src/lib.rs](#lib)
- [src/glass.rs](#glass)
- [src/keys.rs](#keys)

---

## src/lib.rs {#lib}

- refers-to: show_view, panel_size, place
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- The size comes from `panel_size`, not `outer_size`, because GTK reports 0 x 0 for a hidden window, which placed the first panel off-centre. Resizable is switched on just for `set_size`, because GTK ignores `set_size` on a non-resizable window. Under Xvfb with no window manager the Switcher still kept its configured width; macOS and Windows have not been checked.
- refers-to: on_window_event Focused(false)
- kind: warning-context
- Panels hide when they lose focus, except within 300 ms of being shown. Without that guard, a panel shown by a forwarded launch hid itself while focus settled.
- refers-to: watch_switcher
- kind: rationale
- On macOS and Windows a thread polls the modifier every 25 ms while the Switcher is visible, and emits `switcher:commit` on release. On Linux the webview's keyup does it.
- refers-to: register_hotkeys
- kind: rationale
- `switcher-back` is the Switcher chord plus Shift, registered only when the chord has no Shift of its own.
- refers-to: set_hotkey, pause_hotkeys
- kind: rationale
- logged: v0.5.0 · 2026-10-12
- While Settings is recording a chord every global hotkey is unregistered. Otherwise pressing an existing chord would show a view instead of being recorded. Both commands end in a full re-registration.
- refers-to: run ExitRequested
- kind: rationale
- Exits that do not come from Quit are prevented, so FormAI idles in the menu bar.
- refers-to: setup handle_args delay
- kind: rationale
- The first view is shown 350 ms after setup so the webviews have loaded and are listening for `view:shown`.

## src/glass.rs {#glass}

- refers-to: apply (macOS)
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- window-vibrancy 0.8.1 `apply_liquid_glass` moves the window's primary content view (the webview) into the NSGlassEffectView's contentView. It returns UnsupportedPlatformVersion before macOS 26, and then HudWindow vibrancy is used instead. Not yet run on a Mac.

## src/keys.rs {#keys}

- refers-to: held
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- `NSEvent::modifierFlags_class()` takes no MainThreadMarker in objc2-app-kit 0.3.2, so it is safe to call from the polling thread. Shift is treated as held, so Shift+Tab backwards does not commit early.
