# NOTICE

FormTray
Copyright 2026 NodeAgentc, Inc.

Licensed under the Apache License, Version 2.0. See `LICENSE`.

## Dependencies

FormTray's own code and art are nodemode-ai's. The app icon artwork (the icons in `assets/` and `src-tauri/icons/`, and the 34-app family icon pack in dark and light) is the owner's own artwork (NodeAgentc, Inc. / nodemode). Its dependencies are mostly MIT, Apache-2.0 or dual MIT and Apache-2.0, with some BSD, ISC, Zlib, Unicode and CC0 crates, as their manifests declare. Four linked Tauri crates are MPL-2.0 (see "Desktop shell: crates under other licences" below). The main dependencies:

| Package | Used for |
| --- | --- |
| serde, serde_json | data and settings files (`core`, `cli`, `src-tauri`) |
| sysinfo | which Form apps are running (`core`) |
| dirs | per-platform app and config folders (`core`) |
| image (PNG only) | app icons read and scaled (`core`) |
| plist (macOS) | reading app bundles' Info.plist (`core`) |
| windows-sys (Windows) | window and registry calls (`core`, `src-tauri`) |
| tauri 2, tauri-plugin-global-shortcut, tauri-plugin-single-instance, tauri-plugin-autostart | the desktop shell |
| window-vibrancy | vibrancy and acrylic panels on older macOS and Windows |
| objc2-app-kit (macOS) | the system glass and key events |
| gtk, gdkx11, x11 (Linux) | the panel window on Linux |
| Vite, TypeScript, @tauri-apps/cli, @types/node (build only) | building the interface and the app; not shipped |
| `demo/` (no new packages) | the browser demo is built with the same Vite and TypeScript from `frontend/package-lock.json`; it ships the app's own interface code, `core/data/apps.json` and the family icon pack, and adds no font, binary or third-party code |
| `demos/switcher/`, `demos/widgets/` (v0.14.3) | two more browser demos built with the same Vite and TypeScript; each adds no media of its own and builds the demo 1 wallpaper, window screenshots and icon pack, listed in `demos/switcher/CREDITS.md` and `demos/widgets/CREDITS.md` |
| Form Extension Contract kit, Apache-2.0, nodemode | `frontend/src/ext/host-bridge.ts` vendored unchanged; `core/src/extensions.rs` is a line-for-line Rust port of the kit's `formext_host.py` with its messages |
| `demo/src/shots/`, `demo/assets/*.webp` (v0.14.1) | one Pexels photograph (Pexels License) used as the desktop wallpaper, and nine window screenshots taken from the demos of the Apache-2.0 sibling Form apps (their own interface; every photograph, clip or recording visible in them is Pexels, CC0 or public domain and is credited in `demo/CREDITS.md`) |

Every new dependency, binary, font or data file gets a row here before it is used.

## Desktop shell: crates under other licences

Tauri links these crates unedited (no `[patch]` and no vendored copy):

| Crate | Licence | Why it is there |
| --- | --- | --- |
| cssparser, selectors, dtoa-short, option-ext | MPL-2.0 | Tauri's HTML handling (tauri-utils); used unmodified, source at crates.io |
| r-efi | MIT OR Apache-2.0 OR LGPL-2.1-or-later | used under MIT |

The Linux AppImage also carries the build machine's WebKitGTK, GTK and GLib (LGPL-2.1-or-later) as separate shared libraries.

## Trademarks

Apple, macOS and Liquid Glass are trademarks of Apple Inc. Windows is a trademark of the Microsoft group of companies. The names of other Form-family and third-party apps shown in FormTray belong to their owners. FormTray is not affiliated with or endorsed by Apple or Microsoft.
