#[cfg(target_os = "windows")]
pub fn taskbar_dark() -> bool {
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    let key: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize\0".encode_utf16().collect();
    let value: Vec<u16> = "SystemUsesLightTheme\0".encode_utf16().collect();
    let mut data: u32 = 0;
    let mut size: u32 = std::mem::size_of::<u32>() as u32;
    let rc = unsafe { RegGetValueW(HKEY_CURRENT_USER, key.as_ptr(), value.as_ptr(), RRF_RT_REG_DWORD, std::ptr::null_mut(), (&mut data as *mut u32).cast(), &mut size) };
    rc != 0 || data == 0
}

#[cfg(target_os = "linux")]
pub fn taskbar_dark() -> bool {
    std::process::Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "color-scheme"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| !String::from_utf8_lossy(&o.stdout).contains("prefer-light"))
        .unwrap_or(true)
}

#[cfg(target_os = "macos")]
pub fn taskbar_dark() -> bool {
    true
}

pub fn tray_png() -> (&'static [u8], bool) {
    if cfg!(target_os = "macos") {
        (include_bytes!("../icons/tray.png"), true)
    } else if taskbar_dark() {
        (include_bytes!("../icons/tray_light.png"), false)
    } else {
        (include_bytes!("../icons/tray_dark.png"), false)
    }
}
