use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

pub const SPLASH_MIN: Duration = Duration::from_millis(2600);
const BAR_FINISH: Duration = Duration::from_millis(220);
const FALLBACK: Duration = Duration::from_secs(20);

static LAUNCH: OnceLock<Instant> = OnceLock::new();
static REVEALED: AtomicBool = AtomicBool::new(false);

pub fn mark_launch() {
    let _ = LAUNCH.set(Instant::now());
}

pub fn arm_fallback(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FALLBACK);
        show_main(&handle);
    });
}

#[tauri::command(async)]
pub fn app_ready(app: AppHandle) {
    show_main(&app);
}

pub fn skip(app: &AppHandle) {
    REVEALED.store(true, Ordering::SeqCst);
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.destroy();
    }
}

fn show_main(app: &AppHandle) {
    if REVEALED.swap(true, Ordering::SeqCst) {
        return;
    }
    let started = *LAUNCH.get_or_init(Instant::now);
    if let Some(wait) = SPLASH_MIN.checked_sub(started.elapsed()) {
        std::thread::sleep(wait);
    }
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.eval("window.formtraySplashDone && window.formtraySplashDone()");
        std::thread::sleep(BAR_FINISH);
    }
    let inner = app.clone();
    let _ = app.run_on_main_thread(move || {
        crate::first_view(&inner);
        if let Some(splash) = inner.get_webview_window("splash") {
            let _ = splash.destroy();
        }
    });
}

#[cfg(target_os = "macos")]
pub fn round_splash(app: &AppHandle) {
    const RADIUS: f64 = 16.0;
    let Some(splash) = app.get_webview_window("splash") else { return };
    let Ok(ns_window) = splash.ns_window() else { return };
    let address = ns_window as usize;
    let _ = splash.run_on_main_thread(move || unsafe {
        use objc2::msg_send;
        use objc2::runtime::AnyObject;
        let Some(window) = (address as *const objc2_app_kit::NSWindow).as_ref() else { return };
        window.setOpaque(false);
        window.setBackgroundColor(Some(&objc2_app_kit::NSColor::clearColor()));
        let Some(content) = window.contentView() else { return };
        content.setWantsLayer(true);
        let layer: *mut AnyObject = msg_send![&*content, layer];
        if let Some(layer) = layer.as_ref() {
            let _: () = msg_send![layer, setCornerRadius: RADIUS];
            let _: () = msg_send![layer, setMasksToBounds: true];
        }
        window.invalidateShadow();
    });
    let _ = splash.show();
}

#[cfg(not(target_os = "macos"))]
pub fn round_splash(app: &AppHandle) {
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.show();
    }
}
