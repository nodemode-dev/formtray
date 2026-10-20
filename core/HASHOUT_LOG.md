# HASHOUT_LOG · core and cli · formdock

Living log of comment content and rationale for the engine. Source stays comment-free; read this first, then edit surgically.

Current build version: v0.6.0
Last updated: 2026-10-20 · renamed FormDock, prefs folder

---

## Org-navi-map

```
core/
├── Cargo.toml                 formdock-core, no window
├── data/apps.json             the 19 apps: ids, names, hues, icons, every identifier and name
└── src/
    ├── lib.rs                 Engine, Snapshot, AppState
    ├── registry.rs            loads apps.json, lookup by id or any name
    ├── discover.rs            per-OS search roots and candidate matching
    ├── launch.rs              open, focus, quit per OS
    ├── portal.rs              read-only FormPortal installed.json and cached catalogue
    ├── running.rs             sysinfo process scan mapped to apps
    ├── prefs.rs               Prefs, Usage, Tile, config dir, atomic writes
    └── hotkeys.rs             per-OS defaults, reserved chords, normalise, conflict
cli/
└── src/main.rs                list, open, quit, hotkeys, where
```

## Table of contents

- [data/apps.json](#apps-json)
- [src/discover.rs](#discover)
- [src/launch.rs](#launch)
- [src/portal.rs](#portal)
- [src/running.rs](#running)
- [src/lib.rs](#lib)
- [src/prefs.rs](#prefs)
- [src/hotkeys.rs](#hotkeys)

---

## data/apps.json {#apps-json}

- refers-to: identifiers and names arrays
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- Eleven apps ship a bundle id that differs from FormPortal's catalogue or are missing from it, so every entry lists both. The shipped id goes first, because `open -b` tries the ids in order. FormDAM's productName is "DAM", so DAM.app is matched through `names`. FormHub, Form.md and FormSurface have no Tauri config in their repos yet, so their identifiers are guesses that will be confirmed once they are compiled. FormSkills and FormMCP are excluded on the owner's instruction.

## src/discover.rs {#discover}

- refers-to: candidate (macOS)
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- A bundle whose CFBundleIdentifier belongs to the family (`ai.nodemode.*`, `dev.formai.*`, `app.formcut.*`) but does not match this app is rejected before the name check. Otherwise FormPortal.app could match a loose name of another app.
- refers-to: scan depth
- kind: rationale
- Roots are scanned one level deep (for example /Applications/Form/FormVis.app). Bundles are never descended into.

## src/launch.rs {#launch}

- refers-to: open (macOS)
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- `open <path>`, then `open -b <id>` for each id. LaunchServices activates a running app instead of starting a second copy, so macOS needs no separate focus path.
- refers-to: focus (Windows, Linux)
- kind: warning-context
- Windows focuses the first visible top-level window of a running pid. SetForegroundWindow can be refused by Windows' foreground lock, in which case the taskbar button flashes. Linux needs xdotool and X11; without it a second copy is started.
- refers-to: windows_sys::core::BOOL
- kind: warning-context
- windows-sys 0.61 moved BOOL out of Win32::Foundation.

## src/portal.rs {#portal}

- refers-to: root, read_at
- kind: rationale
- logged: v0.5.0 · 2026-10-12
- The root folder and the installed.json format mirror formportal-core 0.44.0 (`Portal::default_root` and `state.rs`), including FORMPORTAL_ROOT. Only the stable channel is used.
- refers-to: catalog/apps.json
- kind: warning-context
- This is the catalogue FormPortal kept after verifying its Ed25519 signature on its last fetch. FormDock does not verify it again, because it only displays the version numbers and never downloads anything. If FormPortal has never fetched, there is no update count.
- refers-to: family_id
- kind: rationale
- FormPortal's catalogue calls FormPortal itself `formai` and still lists FormDeck as `formslide`, so both are mapped to FormDock's ids. Remove these mappings once the rename lands on FormPortal's side.
- refers-to: family_id "formai", root dev.formai.portal
- kind: warning-context
- logged: v0.6.0 · 2026-10-20
- These two strings are FormPortal's own identifiers (its catalogue id and its macOS data folder), not this app's name, so the FormDock rename leaves them as they are. The same holds for the `dev.formai.*` bundle ids in data/apps.json and discover.rs: other Form apps ship them.
- refers-to: newer
- kind: rationale
- A numeric dotted compare; pre-release suffixes are ignored, which is enough for a count.

## src/lib.rs {#lib}

- refers-to: rediscover
- kind: rationale
- logged: v0.5.0 · 2026-10-12
- FormPortal's install path is tried first and resolved to the .app or executable inside it; the OS folders and extra folders come after.
- refers-to: set_hotkey
- kind: rationale
- The order of checks: is the action known, is the chord reserved, and is it already another FormDock action. An empty chord removes the override.

## src/running.rs {#running}

- refers-to: owns
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- On macOS the exe path `/<Name>.app/Contents/MacOS/` decides, and any other .app is rejected, so FormPortal's helper processes do not count as another app. AppImages are matched on the name before the first underscore or hyphen, which handles names like `formwav_2.14.6_amd64.AppImage`.

## src/prefs.rs {#prefs}

- refers-to: Prefs::default
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- The default Stack pins and the Widgets board are the owner's eight: FormVis, FormCut, FormWav, FormDeck, FormLit, FormDAM, FormWeb and FormPortal. The first two board tiles are large.
- refers-to: write
- kind: rationale
- Writes go to a temp file and are then renamed, so a crash cannot leave half a prefs.json.
- refers-to: dir
- kind: warning-context
- logged: v0.6.0 · 2026-10-20
- The folder follows the rename to FormDock: `formdock` on Linux, `ai.nodemode.formdock` elsewhere. Prefs saved under the old `formai` folders are not carried over, because FormAI was never released; move prefs.json and usage.json across by hand to keep a board.

## src/hotkeys.rs {#hotkeys}

- refers-to: defaults, reserved
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- The macOS defaults were checked against Apple's support article 102650: Control+Option+Command is used there only with 8, comma, period and power. The Windows and Linux defaults have not been verified on a device yet. Ctrl+Alt+digit is avoided on Windows because it acts as AltGr on many European layouts. FormRef's click-through chord is listed as reserved on every OS.
- refers-to: effective
- kind: rationale
- An override that hits a reserved chord is ignored and the default is kept.
