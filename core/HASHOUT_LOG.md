# HASHOUT_LOG · core and cli · formtray

Living log of comment content and rationale for the engine. Source stays comment-free; read this first, then edit surgically.

Current build version: v0.9.1
Last updated: 2026-10-22 · the formsculpt entry in apps.json (id, icon, identifier ai.nodemode.formsculpt)

---

## Org-navi-map

```
core/
├── Cargo.toml                 formtray-core, no window
├── data/apps.json             the 23 apps and the excluded list: ids, canonical names, hues, fallback icons, every identifier and name
└── src/
    ├── lib.rs                 Engine, Snapshot, AppState, display_name, discovered entries
    ├── registry.rs            loads apps.json, lookup by id or any name
    ├── identity.rs            live name and icon per OS, icon cache, form_name, menu icons, hue
    ├── discover.rs            per-OS search roots, candidate matching, unknown family bundles
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
- [src/identity.rs](#identity)
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
- refers-to: name, icon
- kind: rationale
- logged: v0.9.0 · 2026-10-22
- `name` is the canonical display casing the owner set: every app is a lowercase form* name except formDAM and formMCP (form.md keeps its dot). It is used as is whenever an app's own name matches the entry (see identity.rs `form_name`), so the casing survives an app that calls itself FormVis or DAM. `icon` is only the fallback in `frontend/public/apps/`, used when the app is not installed; an installed app's own icon always wins. formcel, formtxt, formranker, formMCP and formskills joined on the owner's word (this reverses the v0.4.0 exclusion). Their identifiers `ai.nodemode.<id>`, categories and empty `alt_of` are guesses until those apps ship; hues are the average colour of their new icons. FormPath now ships as formpath, so `ai.nodemode.formpath` goes first and the old `formpth` id stays as an alias.
- refers-to: excluded, the formhub entry
- kind: removed-code
- logged: v0.9.0 · 2026-10-22
- Removed on the owner's word (formhub launches later and will be added then):

```json
{ "id": "formhub", "name": "formhub", "alt_of": "GitHub", "category": "build", "hue": "#eef0f4", "icon": "", "identifiers": ["dev.formai.formhub", "ai.nodemode.formhub"], "names": ["FormHub", "formhub"] },
```

`excluded` keeps it out of automatic discovery too (macOS family bundles and FormPortal installs), so an installed FormHub does not reappear under More. To add it later, put the entry back and drop the id from `excluded`.
- refers-to: formmcp names
- kind: warning-context
- A bare `MCP` alias was tried and removed: on Linux it matched an unrelated `/usr/local/bin/mcp`. Keep aliases form-prefixed.

## src/identity.rs {#identity}

- refers-to: form_name
- kind: rationale
- logged: v0.9.0 · 2026-10-22
- The owner's rule: always the form* name. A live name gets `form` in front when it lacks it (DAM becomes formDAM). If that matches the entry's name or any alias, case-insensitively, the entry's canonical casing is shown; any other live name (a real rename) is shown in lowercase.
- refers-to: read_into, locate (per OS)
- kind: rationale
- macOS: CFBundleDisplayName, then CFBundleName, then the bundle file name; icon from CFBundleIconFile in Resources. Linux: the desktop entry whose Exec program (or file name) matches, its Name and Icon; Icon is an absolute path or looked up in hicolor under ~/.icons, XDG_DATA_HOME and XDG_DATA_DIRS (largest png first, including Tauri's `256x256@2` folder), then scalable svg, then /usr/share/pixmaps. Only hicolor is searched, not the user's current theme, because Form apps install their icons there. Windows: ProductName (then FileDescription) from the version resource, icon from SHDefExtractIconW at 256 px, converted from BGRA.
- refers-to: icns_png, sips_png
- kind: rationale
- Modern .icns files carry PNG payloads; the largest one at or under 512 px is used, larger ones are scaled down. If a file has none (old ARGB or JPEG 2000 types), macOS falls back to the built-in `sips`. Not run on a Mac in this session.
- refers-to: cached, stamp, prune
- kind: rationale
- Cache files are `<id>-<stamp>.<ext>` in `<prefs dir>/icons`, the stamp hashing the source path, size and modification time. An unchanged app is never decoded again, and a changed one gets a new file name, so the webview URL changes only when the icon really changed. Writes go through a `.part` file and a rename. Older files of the same id are removed, along with their `-m` menu copies.
- refers-to: menu_icon, MENU_PX
- kind: rationale
- Menu icons are 36 px copies, sized for an 18 pt slot at 2x like the tray icon; how muda scales menu images was not checked against its source. SVG icons (some Linux apps) get no menu icon, since nothing here rasterises SVG.

## src/discover.rs {#discover}

- refers-to: unknown_family, FAMILY_PREFIXES, SELF_IDENTIFIER
- kind: rationale
- logged: v0.9.0 · 2026-10-22
- macOS only: any bundle under the search roots (and one folder down) whose identifier starts with a family prefix but matches no registry entry becomes a discovered app, id from the identifier's last part. FormTray's own identifier is skipped. Windows and Linux have no bundle identifier, so there discovery relies on FormPortal's installed.json (lib.rs rediscover).

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
- This is the catalogue FormPortal kept after verifying its Ed25519 signature on its last fetch. FormTray does not verify it again, because it only displays the version numbers and never downloads anything. If FormPortal has never fetched, there is no update count.
- refers-to: family_id
- kind: rationale
- FormPortal's catalogue calls FormPortal itself `formai` and still lists FormDeck as `formslide`, so both are mapped to FormTray's ids. Remove these mappings once the rename lands on FormPortal's side.
- refers-to: family_id "formai", root dev.formai.portal
- kind: warning-context
- logged: v0.6.0 · 2026-10-20
- These two strings are FormPortal's own identifiers (its catalogue id and its macOS data folder), not this app's name, so the FormTray rename leaves them as they are. The same holds for the `dev.formai.*` bundle ids in data/apps.json and discover.rs: other Form apps ship them.
- refers-to: newer
- kind: rationale
- A numeric dotted compare; pre-release suffixes are ignored, which is enough for a count.
- refers-to: Product.name, PortalState.names
- kind: rationale
- logged: v0.9.0 · 2026-10-22
- The catalogue's product names are the second name source, after the app itself and before apps.json. They are read for every product, installed or not, and keyed by FormTray's family id.

## src/lib.rs {#lib}

- refers-to: rediscover
- kind: rationale
- logged: v0.5.0 · 2026-10-12
- FormPortal's install path is tried first and resolved to the .app or executable inside it; the OS folders and extra folders come after.
- refers-to: rediscover (registry reload, extra entries, identities)
- kind: rationale
- logged: v0.9.0 · 2026-10-22
- The registry is reloaded from apps.json on every rediscover so discovered entries do not pile up. Discovered apps go into a "More" category, added only when one exists, with the hue of their icon. Identities are read here and only here (start, Find Apps Again, a change of extra folders), never on the running poll.
- refers-to: display_name, AppState.live_icon, AppState.name_source
- kind: rationale
- Name order: the app itself, FormPortal's catalogue, apps.json. `live_icon` is the cache file name or empty; the interface turns it into an `appicon` URL. `name_source` is `app`, `portal` or `registry`, shown by `formtray-cli list`.
- refers-to: set_hotkey
- kind: rationale
- The order of checks: is the action known, is the chord reserved, and is it already another FormTray action. An empty chord removes the override.

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
- logged: v0.8.0 · 2026-10-21
- The folder follows the rename to FormTray: `formtray` on Linux, `ai.nodemode.formtray` elsewhere. Prefs saved under the folders of earlier names (before v0.8.0) are not carried over; move prefs.json and usage.json across by hand to keep a board.

## src/hotkeys.rs {#hotkeys}

- refers-to: defaults, reserved
- kind: rationale
- logged: v0.4.0 · 2026-10-12
- The macOS defaults were checked against Apple's support article 102650: Control+Option+Command is used there only with 8, comma, period and power. The Windows and Linux defaults have not been verified on a device yet. Ctrl+Alt+digit is avoided on Windows because it acts as AltGr on many European layouts. FormRef's click-through chord is listed as reserved on every OS.
- refers-to: effective
- kind: rationale
- An override that hits a reserved chord is ignored and the default is kept.
