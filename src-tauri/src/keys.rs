pub fn modifiers(chord: &str) -> Vec<String> {
    let mut parts: Vec<String> = chord.split('+').map(|p| p.trim().to_ascii_lowercase()).collect();
    parts.pop();
    parts
}

#[cfg(target_os = "macos")]
pub fn held(mods: &[String]) -> Option<bool> {
    use objc2_app_kit::{NSEvent, NSEventModifierFlags};
    let flags = NSEvent::modifierFlags_class();
    Some(!mods.is_empty() && mods.iter().all(|m| match m.as_str() {
        "alt" | "option" => flags.contains(NSEventModifierFlags::Option),
        "control" | "ctrl" => flags.contains(NSEventModifierFlags::Control),
        "super" | "cmd" | "command" => flags.contains(NSEventModifierFlags::Command),
        "shift" => true,
        _ => false,
    }))
}

#[cfg(target_os = "windows")]
pub fn held(mods: &[String]) -> Option<bool> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN};
    let down = |vk: u16| unsafe { (GetAsyncKeyState(vk as i32) as u16 & 0x8000) != 0 };
    Some(!mods.is_empty() && mods.iter().all(|m| match m.as_str() {
        "alt" | "option" => down(VK_MENU),
        "control" | "ctrl" => down(VK_CONTROL),
        "super" | "cmd" | "command" => down(VK_LWIN) || down(VK_RWIN),
        "shift" => true,
        _ => false,
    }))
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn held(_mods: &[String]) -> Option<bool> {
    None
}
