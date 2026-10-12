use tauri::WebviewWindow;

#[cfg(target_os = "macos")]
pub fn radius(label: &str) -> f64 {
    match label {
        "stack" => 24.0,
        "prefs" => 22.0,
        _ => 28.0,
    }
}

#[cfg(target_os = "macos")]
pub fn apply(window: &WebviewWindow) -> &'static str {
    use window_vibrancy::{apply_liquid_glass, apply_vibrancy, LiquidGlassOptions, NSGlassEffectViewStyle, NSVisualEffectMaterial, NSVisualEffectState};
    let r = radius(window.label());
    if apply_liquid_glass(window, LiquidGlassOptions::new(NSGlassEffectViewStyle::Regular).radius(r)).is_ok() {
        return "liquid";
    }
    if apply_vibrancy(window, NSVisualEffectMaterial::HudWindow, Some(NSVisualEffectState::Active), Some(r)).is_ok() {
        return "vibrancy";
    }
    "css"
}

#[cfg(target_os = "windows")]
pub fn apply(window: &WebviewWindow) -> &'static str {
    if window_vibrancy::apply_acrylic(window, Some((20, 22, 27, 150))).is_ok() {
        return "acrylic";
    }
    "css"
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn apply(_window: &WebviewWindow) -> &'static str {
    "css"
}
