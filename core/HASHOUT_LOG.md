# HASHOUT_LOG · core and cli · formtray

Living log of comment content and rationale for the engine. Source stays comment-free; read this first, then edit surgically.

Current build version: v0.16.2
Last updated: 2026-11-10 · v0.16.2, Open makes a downloaded AppImage executable; a running AppImage is matched by its extension; formtray.bat reuses a running interface server and waits for it; formtray.bat cli passes its arguments unchanged; the engine reloads prefs.json and usage.json changed outside the app; Quit on Windows asks the app to close first; 2026-11-10 · v0.16.1, formtray.bat cli forwards its arguments and exit code, README release link (no engine change); 2026-11-09 · v0.16.0, the three demos open inside the app from Settings and the menu bar menu (no engine change); 2026-11-07 · v0.15.1, Greg's README note that updates come through FormPortal (no engine change); 2026-11-07 · v0.15.0, the extension host (Form Extension Contract API 1: resolver, request folder, extensions_list and extension_command); 2026-11-07 · v0.14.3, two more browser demos in demos/ (no engine change); 2026-11-07 · v0.14.2, the shell opens with the formvis splash (no engine change); 2026-11-07 · v0.14.1, the demo opens on a real desktop with real media (no engine change); 2026-11-07 · v0.14.0, the browser demo in demo/ (no engine change); 2026-11-06 · v0.13.0, formcompiler removed as an app (excluded); 2026-11-06 · v0.12.0, hosted launches (--formtray-hosted, FORMTRAY_HOSTED=1); 2026-11-06 · v0.11.0, released Form family apps only (no adoption of other ai.nodemode. bundles), the owner's names and release waves in apps.json, FormPortal's studio.formai.portal root, Widgets by default and the last view on reopen; 2026-11-04 · v0.10.2, the version test reads the README badge of the family template; 2026-11-04 · v0.10.1, the README and screenshots (no code change); 2026-11-04 · v0.10.0, the unified v3 app icon, CODEOWNERS (no code change); 2026-11-03 · v0.9.9 the About and the bundle name NodeAgentc, Inc. (no engine change); 2026-11-02 · v0.9.8, the first build through formcompiler (no code change); 2026-10-26 · the test suite and FB-041 (a desktop entry needs its program); the formsculpt entry in apps.json (id, icon, identifier ai.nodemode.formsculpt)

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
- [tests](#tests)

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
- refers-to: candidate (Linux), which
- kind: decision
- logged: v0.9.7 · 2026-10-26
- A `.desktop` entry counts only when its Exec program is a file: `which` answers for absolute names (is it a file) and for bare names (the first PATH folder holding it). Before 0.9.7 an absolute Exec was accepted even when missing, so a deleted AppImage's leftover entry showed the app as installed and Open failed (FB-041).

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
- refers-to: open, runnable (Linux)
- kind: fix
- logged: v0.16.2 · 2026-11-10
- Discovery lists any `.AppImage` file as installed, and browsers save a download without the execute bit, so Open failed with "Permission denied (os error 13)". Before spawning, an AppImage (extension `appimage`, any case) with no execute bit now gets `+x` (mode | 0o111), what users do by hand; if that fails, Open says "<name> is not executable: chmod +x <path>". Other files and other platforms are unchanged. Checked: in a sandboxed HOME, a mode 644 copy of `sleep` named `FormCut_2.8.8_amd64.AppImage` in ~/Applications opened with `formtray-cli open formcut` (exit 0) and is now 755; `cargo test --locked -p formtray-core -p formtray-cli` passes.

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
- refers-to: owns (the AppImage test)
- kind: fix
- logged: v0.16.2 · 2026-11-10
- The AppImage match above never fired before v0.16.2: it tested `stem.ends_with(".AppImage")`, but `file_stem` has already removed the extension. An AppImage whose inner binary is not named exactly like an entry of `names` showed as not running, so Open started a second copy and Quit said it was not running. The test now reads the extension (`appimage`, any case), as discover.rs does. Checked: a copy of `sleep` named `formwav_1.0_amd64.AppImage` running in a scratch folder lists formwav as running with one process (`formtray-cli list --json`); `cargo test --locked -p formtray-core -p formtray-cli` passes.

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

## tests {#tests}

- refers-to: core/tests/registry_and_settings.rs :: ORDER, Config
- kind: decision
- logged: v0.9.7 · 2026-10-26
- FAMILY_TEST_PLAN v0.3.0 P1. The registry yields the 23 apps in the order apps.json gives them (ORDER is that order, so a reordered or dropped app fails), each once, in a known category, never formtray or an excluded id; lookup by id, name or any name ignores case. Settings tests point XDG_CONFIG_HOME and HOME at a fresh temporary folder and take one lock, because the environment is shared by the tests of one file; no test touches the person's own prefs. Covered: defaults with no file, every field saved and read back with no temporary file left, a corrupt file (bad JSON, empty, wrong type, NUL bytes) falling back to defaults, a partial file keeping its valid fields and an unknown view falling back to `apps`, usage counts.
- refers-to: cli/tests/launch_linux.rs :: Sandbox, only_ours_running, running_copy_of_sleep
- kind: decision
- logged: v0.9.7 · 2026-10-26
- The platform layer is faked for Linux, the one platform CI runs: each test runs the built `formtray-cli` with a cleared environment (HOME, XDG folders and FORMPORTAL_ROOT in a temporary folder, PATH with a fake `xdotool` that records its arguments first). An app that is not running is started from its own folder; a running one (a copy of `sleep` named after the app, so the process scan sees it) is brought forward through `xdotool search --onlyvisible --pid N windowactivate` and not started again; quit ends it. A `.desktop` entry counts only once its program exists (FB-041). Each test uses its own app and the tests take turns, and every test first checks that no other copy of its app runs, because open and quit act on every matching process on the computer: the test stops with a message rather than act on a real app. The macOS (`open -b`, `osascript`) and Windows (window focus) branches are compiled only there and are not run in CI.
- refers-to: core/tests/family_contract.rs :: VERSION_SITES
- kind: decision
- logged: v0.9.7 · 2026-10-26
- The family template (F4 and F9) with formtray's four version sites (no wiki version line).

## owner request 2026-11-06 {#released-only}

- refers-to: discover.rs :: unknown_family, lib.rs :: rediscover, snapshot, open, quit, prefs.rs :: Prefs::load, Usage::load
- kind: decision
- logged: 2026-11-06
- A. FormTray no longer adopts apps that are not in the registry. unknown_family, the discovered entry, the portal-install adoption and the dynamic "more" category are gone; apps.json declares the More category itself. The owner saw Ollama Harness, deduplakit, TopNotch and DAMp in the tray because their bundle ids start with ai.nodemode. On macOS a bundle with a family prefix whose identifier is not in an app's list is still not a match.
- B. Only released apps are listed. An app is released when its opens time has passed or FormPortal's catalogue has a published release for it; formtray itself is never listed. open and quit refuse an id that is not released with NotFound.
- C. The opening view is widgets (default and invalid-value fallback). Installs saved before layout 2 move default_view apps to widgets, rename formslide to formdeck and formranker to formbench in hidden, pinned, widget tiles and usage, then save with layout 2. The default board is formvis, formcut, formwav, formdeck, formlit, formmd, formvfx, formpdf.
- D. form_name returns the registry display name unchanged for family apps (form.md, FormVis); it lowercases only when there is no registry entry.
- why: the owner's request of 2026-11-06, so the tray shows only the released Form family.

## hosted launch 2026-11-06 {#hosted-launch}

- refers-to: launch.rs :: open, HOSTED_FLAG, HOSTED_ENV, HOSTED_ENV_VALUE
- kind: decision
- logged: 2026-11-06
- Apps opened from FormTray should stay out of the Dock. macOS lets only an app hide its own Dock icon (Accessory activation policy), so FormTray cannot do it from outside; it signals the app instead and family apps honour the signal in their own code.
- An app that is not running is started with the argument `--formtray-hosted` and the environment variable `FORMTRAY_HOSTED=1`. On macOS: `open --env FORMTRAY_HOSTED=1 <path> --args --formtray-hosted`, or `open -b <id> --env FORMTRAY_HOSTED=1 --args --formtray-hosted`. If that exits non-zero (older macOS without `open --env`), the same call is retried without `--env`, then the plain `open`, one target after another in the existing order (path, then each identifier). Linux and Windows spawn the program directly with the argument and the variable.
- An app that is already running is only focused: on macOS a plain `open` with no flag, elsewhere the existing window focus. The names are public constants so the shell can reuse them.
- why: the owner's request of 2026-11-06, so apps opened from FormTray stay out of the Dock.

## formcompiler is not an app 2026-11-06 {#formcompiler-removed}

- refers-to: data/apps.json :: apps, excluded; tests/registry_and_settings.rs :: ORDER
- kind: removed-code
- logged: v0.13.0 · 2026-11-06
- The formcompiler entry and its icon pair (formcompiler.webp, formcompiler-light.webp) are gone, and "formcompiler" joined the excluded list so nothing can surface it. formcompiler is only the GitHub repository that compiles and releases builds; it is never downloaded or installed, so it is not a Form family app and is not listed, shown, scheduled, iconed or counted. The registry now holds 33 apps and the icon pack is 34 pairs (33 apps and FormTray itself). Mentions of formcompiler as the build and release pipeline stay.
- why: the owner's request of 2026-11-06, since formcompiler was shown as an app.

## extension host 2026-11-07 {#extensions}

- refers-to: src/extensions.rs :: portal_root, check, resolve, stamp, csp_for, file_for, headers_for, TYPES, PERMISSIONS, id_ok, local_ok, version_ok
- kind: decision
- logged: v0.15.0 · 2026-11-07
- A line-for-line port of the Form Extension Contract kit's `host/python/formext_host.py` (API 1), with its refusal messages word for word. Python's regexes are hand-written byte checks (ID 2 to 64 of `[a-z0-9-]` starting with a letter or digit, local ids 1 to 32, versions `N.N.N`); Python truthiness, `str()` and `!r` are `truthy`, `py_str` and `py_repr`, so a missing value prints `None` exactly as the kit does. Follows the kit as revised on 2026-11-07: a development extension takes its manifest version before the id and product tests (so a refused row shows its real version), an `entry` or `contributes` that is not an object counts as missing, and an `entry.ui` that is not text is refused with the entry.ui message. The API refusal is the kit's single line for any `api` other than "1", a missing one included: "it needs extension API 2; this FormTray offers API 1" (or "API None"), the wording the lead kept for all thirteen apps. `portal_root` is the kit's own copy (FORMPORTAL_ROOT trimmed), separate from `portal::root`, which keeps formtray's older reading for installed.json. Checked here: `cargo build -p formtray-cli`, and the kit's resolver and file_for against the CLI's output on 6 manifests (ready, wrong product, API 2, version mismatch, missing folder, bad id) and 16 file requests (symlinks, traversal, backslash, wrong type, upper-case suffix, refused extension): identical.
- refers-to: src/extensions.rs :: Request, mailbox, submit, take, answer, wait
- kind: rationale
- formtray has no MCP server and its launch-argument route carries no reply, so `formtray-cli extension_command` drops a request file in `<prefs dir>/extension-requests/<id>.json`; the shell's poller renames it to `.taken` and hands it to the window, which runs the command with the same consent rules and writes `<id>.result`. The CLI gives up after 8 s if nothing took the request (FormTray not running) and after 400 s overall. Writes go through `.tmp` and a rename.
- refers-to: cli/src/main.rs :: extensions_list, extension_command, extension_file
- kind: rationale
- The contract's agent tool names are the verbs. `extensions_list --json --base <prefix>` prints the window's listing (with `stamp`) and is what the Vite middleware serves at `/api/extensions`; `extension_file` prints the resolved path, type and headers for one file or exits 1, so the development server answers with the Rust resolver, not a second copy in TypeScript. The app version is the crate version, so `minimum_app` is compared with the workspace version.

## formtray.bat cli branch 2026-11-10 {#bat-cli}

- refers-to: ../formtray.bat :: cli branch, main flow
- kind: warning-context
- logged: v0.16.1 · 2026-11-10
- `formtray.bat cli ...` used to keep `shift`, `%1` to `%9` and `%errorlevel%` inside one parenthesised `if` block. cmd.exe expands every `%` variable of a block when the block is parsed, before `shift` has run, so the CLI received `cli list` instead of `list` and the batch file always exited 0. The branch is now `goto cli` to a `:cli` label below the main flow, so each line is parsed after the previous one has run. The main flow ends with `exit /b %errorlevel%` so it cannot fall into the label. Keep the cli body out of any parenthesised block. TRACED only: not run on Windows.
- refers-to: ../formtray.bat :: :cli; cli/src/main.rs :: main (a leading `cli` is dropped)
- kind: fix
- logged: v0.16.2 · 2026-11-10
- `%1` to `%9` are cmd's re-tokenised view of the command line: an unquoted `=`, `,`, `;` or tab split an argument and the script re-joined the pieces with a space, so `formtray.bat cli extension_command hello say "{\"text\":\"a=b\"}"` sent `{"text":"a b"}`, and a tenth argument was dropped. The cli branch now passes `%*`, the raw text, which `shift` does not change, so it still starts with `cli`; formtray-cli drops a first argument equal to `cli` (any case), which is not a command, so nothing else changes. CRLF kept. Checked on Linux: `formtray-cli cli where` and `CLI where` print the folder (exit 0), `cli nosuch` exits 2, `cli` alone prints help (exit 0). TRACED only for cmd: not run on Windows.
- refers-to: ../formtray.bat :: main flow (where curl, :wait, :nocurl, :ready), :ping
- kind: fix
- logged: v0.16.2 · 2026-11-10
- The main flow always started `npm run dev` and waited a fixed 3 s. Running `formtray.bat` again in the same console after quitting found the first Vite server still on port 5610 and printed Vite's "Port 5610 is already in use" (strictPort); on a cold start where Vite needed longer than 3 s the window could load before Vite listened. Now `:ping` asks `curl -s --max-time 1 http://localhost:5610/` (curl.exe ships with Windows 10 1803 and later); the server is started only when nothing answers, then the script polls up to 20 times a second apart before `cargo run`, like the bash launcher. Without curl it keeps the old start and 3 s wait. Still open: the server started with `start /b` is not stopped when the app quits (the bash launcher kills its process group); a PID from `netstat -ano` needs the localised State column or a port pattern that also matches client connections, so it is left for a check on Windows. CRLF kept. TRACED only: not run on Windows.

## quit on Windows 2026-11-10 {#quit-windows}

- refers-to: src/launch.rs :: quit, close_politely
- kind: fix
- logged: v0.16.2 · 2026-11-10
- Quit on Windows ended the app at once and lost unsaved work: sysinfo supports only `Signal::Kill` there, so `kill_with(Signal::Term)` returned None for every process and the loop fell through to `kill()` (TerminateProcess). Trigger: Quit from the Windows view, Stack, the tray, an extension's `app.quit` or `formtray-cli quit <id>`. Now each pid first gets `taskkill /PID <pid>` without `/F` (started with CREATE_NO_WINDOW so no console flashes), which posts a close message to the process's windows so the app can save or ask; only a pid for which taskkill fails (for example a process with no window) falls back to the old kill. No new dependency. Checked: `cargo check --target x86_64-pc-windows-gnu -p formtray-core` compiles; not run on Windows.

## settings changed outside the app 2026-11-10 {#reload}

- refers-to: src/lib.rs :: Engine::seen, stamp, reload_changed, new, open, set_prefs, note_view
- kind: fix
- logged: v0.16.2 · 2026-11-10
- `Prefs::load` and `Usage::load` ran only in `Engine::new`, and every save writes the whole in-memory struct. The shell keeps one Engine, so with FormTray running `formtray-cli hotkey summon ...` was never registered and was reverted by the app's next `set_prefs`, and `formtray-cli open` counts were lost at the app's next usage save. The engine now remembers the modification time of prefs.json and usage.json (`seen`), taken after loading and after each of its own saves, and `reload_changed` reloads a file whose time differs (prefs: rediscovering when `locations` changed) and returns true. The shell's poller calls it (src-tauri HASHOUT_LOG, #reload). Limits: a write from another process in the instant between the app's own save and its reading of the time, or within the file system's time resolution of the app's save, is not seen until the file changes again. Checked: `cargo test --locked -p formtray-core -p formtray-cli` passes; not run in the app.
