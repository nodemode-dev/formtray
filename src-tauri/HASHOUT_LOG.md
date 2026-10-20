# HASHOUT_LOG · shell · formdock

Living log of comment content and rationale for the Tauri shell. Source stays comment-free; read this first, then edit surgically.

Current build version: v0.6.0
Last updated: 2026-10-20 · FormDock rename, app icon and tray, tray per OS

---

## Org-navi-map

```
src-tauri/
├── tauri.conf.json            six hidden windows, withGlobalTauri, macOSPrivateApi, bundle
├── capabilities/default.json  core plus hide and drag for the six windows
├── icons/                     app icon set and tray.png (menu bar template)
└── src/
    ├── main.rs                calls formdock_shell::run
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
- Exits that do not come from Quit are prevented, so FormDock idles in the menu bar.
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

## icons/ {#icons}

- refers-to: icons/icon.icns, icon.ico, icon.png, 32x32.png, 128x128.png, 128x128@2x.png; ../assets/formdock_icon.png, formdock_icon_macos.png; ../assets/icon_src/
- kind: rationale
- logged: v0.6.0 · 2026-10-20
- The nine flat squares were the one family icon outside the redrawn construction (FormDeck's fanned deck, formpdf's signed page, FormSurface's painted cube, FormDesign's spread). The new mark is a dock: the real sibling icons in a cover-flow arc on a frosted glass plate, formvis facing front in the centre, formpdf and FormDeck turned inward beside it, FormDesign and a "more apps" tile at the ends, with reflections and a family-gradient glow under the glass. Same tile, bloom, rim and drop shadow; the macOS .icns uses the 824 px tile inside a 1024 canvas with a 100 px margin, .ico and PNGs stay full bleed. Sizes 64 px and below show three icons. It is rendered in Chromium with CSS 3D (perspective, rotateY, box-reflect), because the turned cards need real perspective; a flat drawing of rows of gradient squares read as a bar chart. The reflection keeps only each icon's bottom edge, since a longer one mirrored the formvis roller handle as a blob under the centre. The formvis picture is the launcher's 256 px copy cropped to its tile, so a larger formvis master would sharpen the centre at 1024.

- refers-to: icons/tray.png, lib.rs TrayIconBuilder icon_as_template(true)
- kind: rationale
- logged: v0.6.0 · 2026-10-20
- tray.png is tray-v2 as a template image: pure black, with the reference greys turned into alpha (front faces lightest, back rows and side faces near solid), so macOS draws it dark or light with the menu bar. The greys are painted opaque in layer order first and converted per pixel afterwards; drawing each shape with its own alpha let overlapping rows add up into solid blobs. It is 190 x 44 px because tray-v2 is wide, so the status item is wide too. assets/icon_src/tray_template.svg is the vector source.

- refers-to: lib.rs tray_png, icon_as_template(cfg!(target_os = "macos"))
- kind: rationale
- logged: v0.6.0 · 2026-10-20
- Only the macOS menu bar takes the wide black template. Windows' notification area and the Linux appindicator draw tray icons square, so the 190 x 44 template came out squashed, and black on a dark taskbar is close to invisible. They get icons/32x32.png, the redesigned app icon's three-tile small size, in full colour and not as a template.

- refers-to: ../build_app, the Linux package report
- kind: warning-context
- logged: v0.6.0 · 2026-10-20
- Tauri leaves earlier bundles in target/release/bundle, so the report only names packages of the kinds just asked for and of the version in tauri.conf.json. Before that, a `--bundles deb,rpm` run listed a stale AppImage from an earlier version.

- refers-to: ../frontend/public/apps/formdeck.png, formpdf.png, formdesign.png
- kind: rationale
- logged: v0.6.0 · 2026-10-20
- The launcher's copies of the redrawn siblings are replaced with their new full-bleed icons at the same 256 px, so the views do not show the old marks next to the new ones.
