# NOTICE

FormTray
Copyright 2026 nodemode-ai

Licensed under the Apache License, Version 2.0. See `LICENSE`.

## Dependencies

FormTray's own code and art (the icons in `assets/` and `src-tauri/icons/`) are nodemode-ai's. Its dependencies, all MIT, Apache-2.0 or dual MIT and Apache-2.0 as their manifests declare:

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

## Trademarks

Apple, macOS and Liquid Glass are trademarks of Apple Inc. Windows is a trademark of the Microsoft group of companies. The names of other Form-family and third-party apps shown in FormTray belong to their owners. FormTray is not affiliated with or endorsed by Apple or Microsoft.
