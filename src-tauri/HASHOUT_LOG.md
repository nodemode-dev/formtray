# HASHOUT_LOG · shell · formtray

Living log of comment content and rationale for the Tauri shell. Source stays comment-free; read this first, then edit surgically.

Current build version: v0.9.1
Last updated: 2026-10-22 · no shell change; bundles are built by formcompiler, not this repository's desktop.yml

---

## Org-navi-map

```
src-tauri/
├── tauri.conf.json            two hidden windows (panel, prefs), withGlobalTauri, macOSPrivateApi, bundle
├── capabilities/default.json  core plus hide and drag for panel and prefs
├── icons/                     app icon set, tray.png (macOS template), tray_light.png and tray_dark.png
└── src/
    ├── main.rs                calls formtray_shell::run
    ├── lib.rs                 state, commands, show and place, hotkeys, tray menu and refresh, appicon scheme, run loop
    ├── glass.rs               Liquid Glass, vibrancy, acrylic, css
    ├── keys.rs                is the Switcher's modifier still held
    └── theme.rs               taskbar light or dark, which tray image to use
```

## Table of contents

- [src/lib.rs](#lib)
- [src/glass.rs](#glass)
- [src/keys.rs](#keys)
- [src/theme.rs](#theme)
- [icons/](#icons)

---

## src/lib.rs {#lib}

- refers-to: show_view, panel_size, place
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- The size comes from `panel_size`, not `outer_size`, because GTK reports 0 x 0 for a hidden window, which placed the first panel off-centre. Resizable is switched on just for `set_size`, because GTK ignores `set_size` on a non-resizable window. Under Xvfb with no window manager the Switcher still kept its configured width; macOS and Windows have not been checked.
- refers-to: on_window_event Focused(false)
- kind: warning-context
- Panels hide when they lose focus, except within 300 ms of being shown. Without that guard, a panel shown by a forwarded launch hid itself while focus settled.
- refers-to: on_window_event Focused(false), the 180 ms check
- kind: warning-context
- logged: v0.7.0 · 2026-10-20
- On X11 every global hotkey press activates a key grab, which sends the focused panel a focus-out and gives focus back on release. Hiding at once made each Alt+` tap hide and reopen the Switcher (the selection reset and jumped, traced as shown=None on every press), and any view hotkey pressed over a visible panel would blink it. The hide now waits 180 ms and happens only if the panel is still unfocused, and never while the Switcher's chord is held.
- refers-to: watch_switcher
- kind: rationale
- On macOS and Windows a thread polls the modifier every 25 ms while the Switcher is visible, and emits `switcher:commit` on release. On Linux the webview's keyup does it.
- refers-to: watch_switcher, keys::held (Linux)
- kind: rationale
- logged: v0.7.0 · 2026-10-20
- X11 now polls too, through XQueryPointer's modifier mask on its own short-lived display connection, because the release keyup did not reach the webview when the Switcher was opened by holding Alt+` (seen under Xvfb). The watch starts only when the modifier is held at that moment; it used to start whenever `held` was not None, so a Switcher opened from the menu, key 1 or a view hotkey committed at once on every OS. Wayland returns None and keeps the webview keyup fallback.
- refers-to: one panel window, show_view, settle_view, panel_size
- kind: rationale
- The five views share the `panel` window. Apps, Windows and Widgets are all 920 x 660, so switching among them only swaps panes and the panel stays where it is (including where it was dragged). When the size changes, or the panel is hidden, show_view sends `view:show` with `moving` and waits for the page's `settle` (200 ms fallback) before resizing, placing and showing. A visible GTK window only shrank when its min and max size hints were set to the new size; toggling resizable around set_size grew it but never shrank it.
- refers-to: raise (Linux)
- kind: warning-context
- tao 0.37's set_focus is dropped when called right after show (the window is not visible yet) and presents with timestamp 0, so openbox never gave the panel keyboard focus and the number keys, Esc and the search field did nothing until a click. raise presents on the GTK main thread with the X server time, then once more 120 ms later, after the window manager has mapped it; the first request alone was ignored. Other OSs keep set_focus.
- refers-to: tauri.conf.json window titles
- kind: rationale
- Both windows carry titles (FormTray, FormTray Settings); without them Linux and Windows show "Tauri App" in Alt+Tab and taskbars.
- refers-to: register_hotkeys
- kind: rationale
- `switcher-back` is the Switcher chord plus Shift, registered only when the chord has no Shift of its own.
- refers-to: set_hotkey, pause_hotkeys
- kind: rationale
- logged: v0.5.0 · 2026-10-12
- While Settings is recording a chord every global hotkey is unregistered. Otherwise pressing an existing chord would show a view instead of being recorded. Both commands end in a full re-registration.
- refers-to: run ExitRequested
- kind: rationale
- Exits that do not come from Quit are prevented, so FormTray idles in the menu bar.
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

- refers-to: icons/icon.icns, icon.ico, icon.png, 32x32.png, 128x128.png, 128x128@2x.png; ../assets/formtray_icon.png, formtray_icon_macos.png; ../assets/icon_src/
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

- refers-to: icons/tray.png, tray_light.png, tray_dark.png; ../assets/icon_src/tray_grid.svg; theme.rs tray_png
- kind: rationale
- logged: v0.9.0 · 2026-10-22
- Replaces the two v0.6.0 tray entries above. The owner's 3x3 grid (`tray_grid.svg`, kept as supplied) is the menu bar icon on every OS. macOS: a 36 x 36 px black template with each cell's opacity (1.0, and 0.67 for the three faded cells) as alpha, the glyph 32 px so it reads as 16 pt inside the 18 pt height tray-icon 0.25.1 fixes for status items; the status item is now square, not wide. Windows and Linux: 32 x 32 px, the glyph 30 px, white on a dark taskbar and black on a light one. Rendered with Pillow at 16x and scaled down, from the SVG's own rect geometry. `tray_template.svg` (tray-v2) is no longer used.

- refers-to: icons/icon.icns, icon.ico, icon.png, 32x32.png, 128x128.png, 128x128@2x.png; ../assets/formtray_icon.png, formtray_icon_macos.png
- kind: rationale
- logged: v0.9.0 · 2026-10-22
- Replaces the v0.6.0 dock art with the owner's new `formtray_icon_macos.png` (1024 px, from form-icons.zip), on the owner's word. The icns carries PNG payloads from 16 to 1024 px; the ico holds 16 to 256 px. The zip has only the macOS version, so `formtray_icon.png` and the Windows and Linux sizes use it too, with its transparent margin, instead of a full-bleed variant. `assets/icon_src/` (render.mjs, scene.py, sources/) built the old art and no longer matches the shipped icon.

## src/theme.rs {#theme}

- refers-to: taskbar_dark
- kind: warning-context
- logged: v0.9.0 · 2026-10-22
- Windows reads `SystemUsesLightTheme` under HKCU `...\Themes\Personalize`, the shell (taskbar) setting, not `AppsUseLightTheme`, the one the webview's theme follows. The key name comes from community answers, not a Microsoft reference page; confirm on a device. Linux asks GNOME's `color-scheme` through gsettings and treats anything but `prefer-light` (including no gsettings, KDE and others) as a dark panel, since most Linux panels are dark. macOS uses the template, so the answer is unused there.

## src/lib.rs · tray and appicon {#lib-tray}

- refers-to: tray_menu, refresh_tray
- kind: rationale
- logged: v0.9.0 · 2026-10-22
- The menu starts with the pinned apps that are installed and not hidden, each an IconMenuItem with the app's live name and its 36 px cached icon (no icon when the app only has an SVG or none). It is rebuilt with `set_menu` after a rescan (menu or command), after Settings saves prefs (pins change there), and the Windows and Linux tray image is swapped when the panel's theme changes. tray-icon's `set_icon` drops template mode, so the macOS icon is never swapped at runtime. Open at Login now flips the saved pref rather than reading the menu item, because the item is recreated with each rebuild.
- refers-to: icon_response, register_uri_scheme_protocol("appicon")
- kind: rationale
- Serves only files directly inside the engine's icon cache: the name must be letters, digits, `-`, `_` and `.` with no `..`, so no other path can be read. Responses are cacheable for a year because a changed icon gets a new file name. The webview reaches it as `appicon://localhost/<file>` on macOS and Linux and `http://appicon.localhost/<file>` on Windows (Tauri's custom-scheme origins); both are in the CSP `img-src`.

- refers-to: ../frontend/public/apps/formdeck.png, formpdf.png, formdesign.png
- kind: rationale
- logged: v0.6.0 · 2026-10-20
- The launcher's copies of the redrawn siblings are replaced with their new full-bleed icons at the same 256 px, so the views do not show the old marks next to the new ones.
