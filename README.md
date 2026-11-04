<p align="center">
  <img src="assets/app-icon/formtray-256.png" width="128" height="128" alt="FormTray icon: a dark rounded square with a row of small app icons floating above a purple glow">
</p>

<h1 align="center">FormTray</h1>

<p align="center">
  <b>Launcher; one dock icon for every Form app.</b><br>
  Switch, launch and arrange the whole family from five views on glass,<br>
  with rebindable hotkeys and no network access. Rust core, on your own computer.
</p>

<p align="center">
  <img alt="version 0.10.0" src="https://img.shields.io/badge/version-0.10.0-eef0f4?style=flat-square">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-stable-B7410E?style=flat-square&logo=rust&logoColor=white">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square">
  <img alt="macOS, Windows, Linux" src="https://img.shields.io/badge/macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-native-2f7bf5?style=flat-square">
  <img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-3a3a3a?style=flat-square">
  <img alt="Status: released" src="https://img.shields.io/badge/status-released-d69e2e?style=flat-square">
</p>

<p align="center">
  <a href="https://formtray.formai.studio/"><b>Download FormTray on formai.studio</b></a> ·
  <a href="https://github.com/nodemode-dev/formcompiler/releases/tag/formtray-v0.9.8">Latest release</a> ·
  <a href="#run-it-from-source">Run it from source</a> ·
  <a href="#the-form-family">All Form apps</a>
</p>

<br>

<p align="center">
  <img src="docs/images/formtray-hero.webp" alt="FormTray's Apps view: a search box, category chips, a Recent row and a grid of Form app icons with running dots" width="100%">
  <br>
  <sub>The Apps view, with sample running and recent state: search, categories, recents and every app in one panel.</sub>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#everything-in-the-box">In the box</a> ·
  <a href="#built-for-agents">Agents</a> ·
  <a href="#under-the-hood">Under the hood</a> ·
  <a href="#download">Download</a> ·
  <a href="#run-it-from-source">Run from source</a> ·
  <a href="#the-form-family">Form family</a>
</p>

<br>

<table>
  <tr>
    <td width="25%" valign="top"><h3>One icon, 23 apps</h3>Pin FormTray instead of twenty-three icons. Every view reads one state, so pins, recents and running dots agree.</td>
    <td width="25%" valign="top"><h3>Real system glass</h3>macOS 26 gets a native glass material, older macOS vibrancy, Windows acrylic and Linux solid themed panels.</td>
    <td width="25%" valign="top"><h3>Hotkeys that behave</h3>Defaults avoid each system's reserved chords. Rebind any of them in Settings; clashes are refused, not ignored.</td>
    <td width="25%" valign="top"><h3>Agent-ready</h3>The same engine runs from the window and from a command line that lists, opens and quits apps.</td>
  </tr>
</table>

<br>

## Features

<table>
  <tr>
    <td width="50%" valign="top"><img src="docs/images/formtray-switcher.webp" alt="The Switcher: a horizontal strip of app icons with the selected app named below" width="100%"><br><sub>The Switcher, a Cmd+Tab-style strip.</sub>
      <h3>Switch in one frame</h3>Hold the modifier and tap to move along the strip. The view appears the instant the hotkey is pressed.</td>
    <td width="50%" valign="top"><img src="docs/images/formtray-stack.webp" alt="The Stack: a three-column grid of pinned app icons with an All Apps button" width="100%"><br><sub>The Stack, a Dock folder grid.</sub>
      <h3>A Stack above the Dock</h3>Click the Dock icon and your pinned apps pop up above it, with All Apps one click away.</td>
  </tr>
  <tr>
    <td width="50%" valign="top"><img src="docs/images/formtray-widgets.webp" alt="The Widgets board: large and small app tiles showing running state and last opened time" width="100%"><br><sub>The Widgets board, arranged by you.</sub>
      <h3>Widgets you arrange</h3>App tiles in three sizes, groups that open as a pop-over, and a FormPortal Updates tile that never fetches.</td>
    <td width="50%" valign="top"><img src="docs/images/formtray-windows.webp" alt="The Windows view: cards for three running apps with run time, focus and quit buttons" width="100%"><br><sub>The Windows view, for apps that are open.</sub>
      <h3>See what is running</h3>One card per open app with how long it has run, a button to bring it forward and one to quit it.</td>
  </tr>
</table>

## Everything in the box

<table>
  <tr>
    <td width="33%" valign="top"><h4>5 views plus Settings</h4>Switcher · Stack · Apps · Windows · Widgets · Settings</td>
    <td width="33%" valign="top"><h4>23 apps, 6 categories</h4>Image · Video and Audio · Documents · 3D · Web and Code · Family</td>
    <td width="33%" valign="top"><h4>Platforms</h4>macOS (Dock, menu bar) · Windows (taskbar) · Linux (X11 hotkeys, Wayland by command)</td>
  </tr>
</table>

## Built for agents

`formtray-cli` runs the same engine as the window, without opening it. It has no MCP server.

```sh
./formtray cli list --json      # every Form app, whether it is installed and running
./formtray cli open formvis     # open an app, or bring it forward if it is running
./formtray cli updates          # updates FormPortal has seen (read only, no network)
```

`./formtray cli hotkeys`, `quit <app>`, `hotkey <action> <chord>` and `where` complete it. See [`CLAUDE.md`](CLAUDE.md).

## Under the hood

- **Engine:** `formtray-core` holds the app registry, discovery, open, focus, quit, running state, preferences and hotkey tables.
- **Shell:** a Tauri 2 shell for panels, glass, the menu bar, hotkeys, Dock reopen, single instance and autostart.
- **Interface:** vanilla TypeScript and Vite with zero runtime dependencies.
- **Finds apps by name:** reads FormPortal's install record first, then every bundle identifier and name each app has shipped under.
- **Offline:** FormTray never touches the network. It reads, but never writes, FormPortal's `installed.json` and catalogue.
- **Tested:** 17 Rust tests (registry, settings and the family contract).

## Download

**Get the app:** download FormTray from [formai.studio](https://formtray.formai.studio/). That is the easiest way to install it.

**Latest build:** [formtray 0.9.8](https://github.com/nodemode-dev/formcompiler/releases/tag/formtray-v0.9.8) on FormCompiler.

**Keep it updated:** [FormPortal](https://github.com/nodemode-dev/formportal) installs, updates and rolls back every Form app from the same signed catalogue.

| Platform | Builds |
|---|---|
| macOS Apple silicon | yes |
| macOS Intel | yes |
| Linux x64 | yes |
| Windows x64 | yes |

All FormTray builds are compiled and released from [`nodemode-dev/formcompiler`](https://github.com/nodemode-dev/formcompiler/releases), not from this repo. This repo holds the source.

## Run it from source

Prefer it in your browser, or want to contribute? Run the interface straight from this repo.

**Requires:** Rust (stable), Node 20.19+, and on Linux WebKitGTK 4.1 for the desktop window (the installer prints the packages).

```sh
git clone git@github.com:nodemode-dev/formtray.git
cd formtray
./formtray_oc_install   # checks tools, installs the interface packages, fetches the Rust crates
./formtray              # starts the interface on port 5610 and the desktop app
```

In a browser, `cd frontend && npm run dev` then open `http://localhost:5610/?view=apps` (or `switcher`, `stack`, `windows`, `widgets`, `prefs`). The browser build shows sample running and recent state.

On Windows run `formtray_oc_install.bat`, then `formtray.bat`. `./build_app` builds the bundles locally.

Default hotkeys: the Switcher is Option + Tab on macOS and Alt + ` on Windows and Linux (X11). On Wayland, bind `formtray --view apps` (or `switcher`, `stack`, `windows`, `widgets`) in your desktop's keyboard settings.

> [!IMPORTANT]
> **Status:** released. Add a Form app by adding one entry to `core/data/apps.json`; formhub is held back until it launches. FormPortal installs and updates apps; FormTray only opens and switches them.

**Contributing:** branch from `main`, keep changes to source here, and leave packaging and releases to formcompiler. See [`CLAUDE.md`](CLAUDE.md).

## Repository

| Path | What it is |
|---|---|
| `core/` | The engine: registry (`core/data/apps.json`), discovery, open, focus, quit, running state, prefs, hotkeys |
| `cli/` | `formtray-cli`: `list`, `open`, `quit`, `hotkeys`, `hotkey`, `updates`, `where` |
| `src-tauri/` | The window shell: panels, glass, menu bar, hotkeys, single instance |
| `frontend/` | The interface: the views, tokens and the layer scale (dev server on 5610) |
| `assets/` | The app icon and the icon and tray sources in `icon_src/` |
| `build_app`, `build_app.bat` | One-shot desktop builds |

## The Form family

FormTray is one of the **Form apps**: native creative tools that install, update and roll back through FormPortal and can all be driven by agents.

| | App | What it's for | Download | Code |
|:-:|---|---|---|---|
| <img src=".github/assets/family/form.md.png" alt="" width="32" height="32"> | **form.md** | Documents, databases and realtime editing together | [formai.studio](https://formmd.formai.studio/) | [GitHub](https://github.com/nodemode-dev/form.md) |
| <img src=".github/assets/family/format.png" alt="" width="32" height="32"> | **FormAT** | Chat and agent workspace on your key | [formai.studio](https://format.formai.studio/) | [GitHub](https://github.com/nodemode-dev/format) |
| <img src=".github/assets/family/formCAD.png" alt="" width="32" height="32"> | **FormCAD** | Drafting, parametric parts and NURBS surfaces | | [GitHub](https://github.com/nodemode-dev/formCAD) |
| <img src=".github/assets/family/formcel.png" alt="" width="32" height="32"> | **FormCel** | Spreadsheets agents can read and edit | [formai.studio](https://formcel.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formcel) |
| <img src=".github/assets/family/formcraft.png" alt="" width="32" height="32"> | **FormCraft** | Generate images, video, audio, 3D and worlds | | [GitHub](https://github.com/nodemode-dev/formcraft) |
| <img src=".github/assets/family/formcut.png" alt="" width="32" height="32"> | **FormCut** | Multi-track video editing with no upload | [formai.studio](https://formcut.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formcut) |
| <img src=".github/assets/family/formDAM.png" alt="" width="32" height="32"> | **FormDAM** | Photo library and asset manager | [formai.studio](https://formdam.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formDAM) |
| <img src=".github/assets/family/formdeck.png" alt="" width="32" height="32"> | **FormDeck** | Presentations and pitch decks | [formai.studio](https://formdeck.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formdeck) |
| <img src=".github/assets/family/formdesign.png" alt="" width="32" height="32"> | **FormDesign** | Page layout for print and the web | [formai.studio](https://formdesign.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formdesign) |
| <img src=".github/assets/family/formencoder.png" alt="" width="32" height="32"> | **FormEncoder** | Media encoding queue with presets | [formai.studio](https://formencoder.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formencoder) |
| <img src=".github/assets/family/formfabric.png" alt="" width="32" height="32"> | **FormFabric** | Sewing patterns draped with cloth simulation | | [GitHub](https://github.com/nodemode-dev/formfabric) |
| <img src=".github/assets/family/formlit.png" alt="" width="32" height="32"> | **FormLit** | Photo library and raw development | [formai.studio](https://formlit.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formlit) |
| <img src=".github/assets/family/formmorpheus.png" alt="" width="32" height="32"> | **FormMorpheus** | Frame-by-frame and performed animation | | [GitHub](https://github.com/nodemode-dev/formmorpheus) |
| <img src=".github/assets/family/formNET.png" alt="" width="32" height="32"> | **FormNET** | See what your computer sends online | | [GitHub](https://github.com/nodemode-dev/formNET) |
| <img src=".github/assets/family/formpath.png" alt="" width="32" height="32"> | **FormPath** | Vector illustration with artboards and type | [formai.studio](https://formpath.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formpath) |
| <img src=".github/assets/family/formpdf.png" alt="" width="32" height="32"> | **FormPDF** | Edit, redact, sign and fill PDFs | [formai.studio](https://formpdf.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formpdf) |
| <img src=".github/assets/family/formpromo.png" alt="" width="32" height="32"> | **FormPromo** | Promo films from your own media | [formai.studio](https://formpromo.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formpromo) |
| <img src=".github/assets/family/formref.png" alt="" width="32" height="32"> | **FormRef** | Reference boards for creative work | [formai.studio](https://formref.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formref) |
| <img src=".github/assets/family/formrig.png" alt="" width="32" height="32"> | **FormRig** | Rig, skin and retarget any mesh | | [GitHub](https://github.com/nodemode-dev/formrig) |
| <img src=".github/assets/family/formsculpt.png" alt="" width="32" height="32"> | **FormSculpt** | 3D sculpting, remeshing and painting | [formai.studio](https://formsculpt.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formsculpt) |
| <img src=".github/assets/family/formsurface.png" alt="" width="32" height="32"> | **FormSurface** | Texture painting with PBR export | [formai.studio](https://formsurface.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formsurface) |
| <img src=".github/assets/family/formtools.png" alt="" width="32" height="32"> | **FormTools** | Viewers, batch tools and file utilities | | [GitHub](https://github.com/nodemode-dev/formtools) |
| <img src=".github/assets/family/formtxt.png" alt="" width="32" height="32"> | **FormTxt** | Word processing with .docx round trips | [formai.studio](https://formtxt.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formtxt) |
| <img src=".github/assets/family/formvfx.png" alt="" width="32" height="32"> | **FormVFX** | Motion graphics and VFX compositing | [formai.studio](https://formvfx.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formvfx) |
| <img src=".github/assets/family/formvis.png" alt="" width="32" height="32"> | **FormVis** | Layered image editing with local AI | [formai.studio](https://formvis.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formvis) |
| <img src=".github/assets/family/formwav.png" alt="" width="32" height="32"> | **FormWav** | Multitrack audio editing and mixing | [formai.studio](https://formwav.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formwav) |
| <img src=".github/assets/family/formweb.png" alt="" width="32" height="32"> | **FormWeb** | Visual website building with a CMS | [formai.studio](https://formweb.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formweb) |
| <img src=".github/assets/family/formportal.png" alt="" width="32" height="32"> | **FormPortal** | Install, update and roll back Form apps | [formai.studio](https://formportal.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formportal) |
| <img src=".github/assets/family/formtray.png" alt="" width="32" height="32"> | **FormTray** | One dock icon for every app | [formai.studio](https://formtray.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formtray) |
| <img src=".github/assets/family/formMCP.png" alt="" width="32" height="32"> | **FormMCP** | One MCP connection to the family | [formai.studio](https://formmcp.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formMCP) |
| <img src=".github/assets/family/formskills.png" alt="" width="32" height="32"> | **FormSkills** | Every app's agent skills in one place | [formai.studio](https://formskill.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formskills) |
| <img src=".github/assets/family/formbench.png" alt="" width="32" height="32"> | **FormBench** | Parity, testing and rankings for the family | [formai.studio](https://formranker.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formbench) |
| <img src=".github/assets/family/formslot.png" alt="" width="32" height="32"> | **FormSlot** | Codebase memory for coding agents | | [GitHub](https://github.com/nodemode-dev/formslot) |
| <img src=".github/assets/family/subform.png" alt="" width="32" height="32"> | **SubForm** | Workbench for parallel Claude Code agents | | [GitHub](https://github.com/nodemode-dev/subform) |
| <img src=".github/assets/family/formcompiler.png" alt="" width="32" height="32"> | **FormCompiler** | Builds, signs and releases every app | [formai.studio](https://formcompiler.formai.studio/) | [GitHub](https://github.com/nodemode-dev/formcompiler) |
| <img src=".github/assets/family/formpipe.png" alt="" width="32" height="32"> | **FormPipe** | Release pipeline and update feeds | | [GitHub](https://github.com/nodemode-dev/formpipe) |

<br>

---

## Maintainers

| Maintainer | Role |
|---|---|
| [@nodemode-ai](https://github.com/nodemode-ai) | Owner |
| [@gbarnai](https://github.com/gbarnai) | Co-owner |

Code owners are set in [`.github/CODEOWNERS`](.github/CODEOWNERS).

## License

FormTray is licensed under the Apache License 2.0 ([`LICENSE`](LICENSE), SPDX `Apache-2.0`). Copyright 2026 NodeAgentc, Inc. Third-party notices: [`NOTICE.md`](NOTICE.md).

<sub>Apple, macOS and Liquid Glass are trademarks of Apple Inc. Windows is a trademark of the Microsoft group of companies. FormTray is an independent project and is not affiliated with or endorsed by them.</sub>
