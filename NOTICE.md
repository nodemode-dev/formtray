# NOTICE

FormTray
Copyright 2026 nodemode-ai

Licensed under the Apache License, Version 2.0. See `LICENSE`.

## Dependencies

FormTray's own code and art (the icons in `assets/` and `src-tauri/icons/`) are nodemode-ai's. Its dependencies are mostly MIT, Apache-2.0 or dual MIT and Apache-2.0, with some BSD, ISC, Zlib, Unicode and CC0 crates, as their manifests declare. Four linked Tauri crates are MPL-2.0 (see "Desktop shell: crates under other licences" below). The main dependencies:

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
