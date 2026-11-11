use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use crate::registry::AppEntry;

pub const MENU_PX: u32 = 36;
const LARGEST: u32 = 512;

#[derive(Debug, Clone, Default)]
pub struct Identity {
    pub name: Option<String>,
    pub icon: Option<String>,
}

enum Source {
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    Icns(PathBuf),
    #[cfg_attr(not(all(unix, not(target_os = "macos"))), allow(dead_code))]
    File(PathBuf),
    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    Exe(PathBuf),
}

impl Source {
    fn path(&self) -> &Path {
        match self {
            Source::Icns(p) | Source::File(p) | Source::Exe(p) => p,
        }
    }
}

pub fn cache_dir() -> PathBuf {
    crate::prefs::dir().join("icons")
}

pub fn form_name(entry: Option<&AppEntry>, live: &str) -> Option<String> {
    let live = live.trim();
    if live.is_empty() {
        return None;
    }
    let prefixed = live.get(..4).is_some_and(|p| p.eq_ignore_ascii_case("form"));
    let base = if prefixed { live.to_string() } else { format!("form{live}") };
    if let Some(e) = entry {
        if e.matches_name(live) || e.matches_name(&base) {
            return Some(e.name.clone());
        }
    }
    Some(base.to_lowercase())
}

pub fn read(app: &AppEntry, path: &Path) -> Identity {
    read_into(app, path, &cache_dir())
}

pub fn read_into(app: &AppEntry, path: &Path, cache: &Path) -> Identity {
    let (name, source) = locate(app, path);
    let icon = source.and_then(|s| cached(&app.id, &s, cache));
    Identity { name, icon }
}

pub fn menu_icon(cache: &Path, icon: &str) -> Option<PathBuf> {
    let full = cache.join(icon);
    if full.extension().is_none_or(|e| e != "png") {
        return None;
    }
    let small = cache.join(format!("{}-m.png", full.file_stem()?.to_string_lossy()));
    if small.is_file() {
        return Some(small);
    }
    let image = image::open(&full).ok()?;
    image.resize(MENU_PX, MENU_PX, image::imageops::FilterType::Lanczos3).save(&small).ok()?;
    Some(small)
}

pub fn hue(cache: &Path, icon: &str) -> Option<String> {
    let image = image::open(cache.join(icon)).ok()?.thumbnail(32, 32).to_rgba8();
    let (mut sum, mut n) = ([0u64; 3], 0u64);
    for p in image.pixels() {
        let [r, g, b, a] = p.0;
        if a > 200 && r.max(g).max(b) - r.min(g).min(b) > 60 {
            sum[0] += r as u64;
            sum[1] += g as u64;
            sum[2] += b as u64;
            n += 1;
        }
    }
    (n > 0).then(|| format!("#{:02x}{:02x}{:02x}", sum[0] / n, sum[1] / n, sum[2] / n))
}

fn stamp(source: &Path) -> Option<String> {
    let meta = std::fs::metadata(source).ok()?;
    let mut h = std::collections::hash_map::DefaultHasher::new();
    source.hash(&mut h);
    meta.len().hash(&mut h);
    meta.modified().ok().hash(&mut h);
    Some(format!("{:08x}", h.finish() as u32))
}

fn cached(id: &str, source: &Source, cache: &Path) -> Option<String> {
    let stamp = stamp(source.path())?;
    let ext = match source {
        Source::File(p) if p.extension().is_some_and(|e| e.eq_ignore_ascii_case("svg")) => "svg",
        _ => "png",
    };
    let file = format!("{id}-{stamp}.{ext}");
    let target = cache.join(&file);
    if !target.is_file() {
        std::fs::create_dir_all(cache).ok()?;
        let bytes = match source {
            Source::Icns(p) => icns_png(p).or_else(|| sips_png(p))?,
            Source::File(p) if ext == "svg" => std::fs::read(p).ok()?,
            Source::File(p) => fit_png(&std::fs::read(p).ok()?)?,
            Source::Exe(p) => exe_png(p)?,
        };
        let partial = cache.join(format!("{file}.part"));
        std::fs::write(&partial, bytes).ok()?;
        std::fs::rename(&partial, &target).ok()?;
        prune(cache, id, &file);
    }
    Some(file)
}

fn prune(cache: &Path, id: &str, keep: &str) {
    let prefix = format!("{id}-");
    let keep_stem = keep.rsplit_once('.').map(|(s, _)| s).unwrap_or(keep);
    let Ok(entries) = std::fs::read_dir(cache) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let ours = name.strip_prefix(&prefix).is_some_and(|rest| rest.len() >= 8 && rest[..8].chars().all(|c| c.is_ascii_hexdigit()));
        if ours && !name.starts_with(keep_stem) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

fn png_size(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 24 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }
    let w = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
    let h = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
    Some((w, h))
}

fn fit_png(bytes: &[u8]) -> Option<Vec<u8>> {
    let (w, h) = png_size(bytes)?;
    if w.max(h) <= LARGEST {
        return Some(bytes.to_vec());
    }
    let image = image::load_from_memory(bytes).ok()?.resize(LARGEST, LARGEST, image::imageops::FilterType::Lanczos3);
    let mut out = std::io::Cursor::new(Vec::new());
    image.write_to(&mut out, image::ImageFormat::Png).ok()?;
    Some(out.into_inner())
}

pub fn icns_png(path: &Path) -> Option<Vec<u8>> {
    let data = std::fs::read(path).ok()?;
    if data.len() < 8 || &data[..4] != b"icns" {
        return None;
    }
    let mut best: Option<(u32, &[u8])> = None;
    let mut at = 8;
    while at + 8 <= data.len() {
        let len = u32::from_be_bytes(data[at + 4..at + 8].try_into().ok()?) as usize;
        if len < 8 || at + len > data.len() {
            break;
        }
        let body = &data[at + 8..at + len];
        if let Some((w, _)) = png_size(body) {
            let better = match best {
                None => true,
                Some((b, _)) => (w <= LARGEST && (b > LARGEST || w > b)) || (b > LARGEST && w < b),
            };
            if better {
                best = Some((w, body));
            }
        }
        at += len;
    }
    best.and_then(|(_, body)| fit_png(body))
}

#[cfg(target_os = "macos")]
fn sips_png(path: &Path) -> Option<Vec<u8>> {
    let out = std::env::temp_dir().join(format!("formtray-icon-{}.png", std::process::id()));
    let ok = std::process::Command::new("/usr/bin/sips")
        .args(["-s", "format", "png", "-Z", &LARGEST.to_string()])
        .arg(path)
        .arg("--out")
        .arg(&out)
        .output()
        .is_ok_and(|o| o.status.success());
    let bytes = ok.then(|| std::fs::read(&out).ok()).flatten();
    let _ = std::fs::remove_file(&out);
    bytes
}

#[cfg(not(target_os = "macos"))]
fn sips_png(_path: &Path) -> Option<Vec<u8>> {
    None
}

#[cfg(not(target_os = "windows"))]
fn exe_png(_path: &Path) -> Option<Vec<u8>> {
    None
}

#[cfg(target_os = "macos")]
fn locate(_app: &AppEntry, path: &Path) -> (Option<String>, Option<Source>) {
    let Ok(value) = plist::Value::from_file(path.join("Contents/Info.plist")) else {
        return (None, None);
    };
    let dict = value.as_dictionary();
    let text = |key: &str| dict.and_then(|d| d.get(key)).and_then(|v| v.as_string()).map(str::to_string).filter(|s| !s.trim().is_empty());
    let name = text("CFBundleDisplayName").or_else(|| text("CFBundleName")).or_else(|| path.file_stem().map(|s| s.to_string_lossy().to_string()));
    let icon = text("CFBundleIconFile").map(|f| {
        let res = path.join("Contents/Resources");
        let direct = res.join(&f);
        if direct.extension().is_some() && direct.is_file() { direct } else { res.join(format!("{f}.icns")) }
    });
    (name, icon.filter(|p| p.is_file()).map(Source::Icns))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn locate(app: &AppEntry, path: &Path) -> (Option<String>, Option<Source>) {
    let Some(entry) = linux::desktop_entry(app, path) else {
        return (None, None);
    };
    let icon = entry.icon.as_deref().and_then(linux::icon_path).map(Source::File);
    (entry.name, icon)
}

#[cfg(target_os = "windows")]
fn locate(_app: &AppEntry, path: &Path) -> (Option<String>, Option<Source>) {
    if !path.is_file() {
        return (None, None);
    }
    (windows::product_name(path), Some(Source::Exe(path.to_path_buf())))
}

#[cfg(target_os = "windows")]
fn exe_png(path: &Path) -> Option<Vec<u8>> {
    windows::icon_png(path)
}

#[cfg(all(unix, not(target_os = "macos")))]
pub mod linux {
    use std::path::{Path, PathBuf};

    use crate::registry::AppEntry;

    pub struct DesktopEntry {
        pub name: Option<String>,
        pub icon: Option<String>,
    }

    fn data_dirs() -> Vec<PathBuf> {
        let mut dirs = Vec::new();
        if let Some(home) = std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).or_else(|| dirs::home_dir().map(|h| h.join(".local/share"))) {
            dirs.push(home);
        }
        let system = std::env::var("XDG_DATA_DIRS").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "/usr/local/share:/usr/share".to_string());
        dirs.extend(system.split(':').filter(|s| !s.is_empty()).map(PathBuf::from));
        dirs
    }

    pub fn parse(text: &str) -> DesktopEntry {
        let mut in_main = false;
        let (mut name, mut icon) = (None, None);
        for line in text.lines() {
            let line = line.trim();
            if line.starts_with('[') {
                in_main = line == "[Desktop Entry]";
                continue;
            }
            if !in_main {
                continue;
            }
            if let Some(v) = line.strip_prefix("Name=") {
                name = Some(v.trim().to_string()).filter(|s| !s.is_empty());
            } else if let Some(v) = line.strip_prefix("Icon=") {
                icon = Some(v.trim().to_string()).filter(|s| !s.is_empty());
            }
        }
        DesktopEntry { name, icon }
    }

    fn stem(p: &Path) -> String {
        p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
    }

    pub fn desktop_entry(app: &AppEntry, program: &Path) -> Option<DesktopEntry> {
        let program_stem = stem(program);
        for dir in data_dirs().into_iter().map(|d| d.join("applications")) {
            let Ok(entries) = std::fs::read_dir(&dir) else { continue };
            for file in entries.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|e| e == "desktop")) {
                let Ok(text) = std::fs::read_to_string(&file) else { continue };
                let exec = text.lines().find_map(|l| l.trim().strip_prefix("Exec=")).and_then(|e| e.split_whitespace().next()).map(|p| stem(Path::new(p.trim_matches('"'))));
                let hit = exec.as_deref().is_some_and(|e| e == program_stem || app.matches_name(e)) || app.matches_name(&stem(&file));
                if hit {
                    return Some(parse(&text));
                }
            }
        }
        None
    }

    pub fn icon_path(icon: &str) -> Option<PathBuf> {
        let direct = Path::new(icon);
        if direct.is_absolute() {
            return direct.is_file().then(|| direct.to_path_buf());
        }
        let mut bases: Vec<PathBuf> = Vec::new();
        if let Some(h) = dirs::home_dir() {
            bases.push(h.join(".icons"));
        }
        bases.extend(data_dirs().into_iter().map(|d| d.join("icons")));
        const SIZES: [&str; 10] = ["512x512", "256x256@2", "256x256", "192x192", "128x128@2", "128x128", "96x96", "64x64", "48x48", "32x32"];
        for base in &bases {
            let theme = base.join("hicolor");
            for size in SIZES {
                let p = theme.join(size).join("apps").join(format!("{icon}.png"));
                if p.is_file() {
                    return Some(p);
                }
            }
            let svg = theme.join("scalable/apps").join(format!("{icon}.svg"));
            if svg.is_file() {
                return Some(svg);
            }
        }
        ["png", "svg"].iter().map(|ext| PathBuf::from(format!("/usr/share/pixmaps/{icon}.{ext}"))).find(|p| p.is_file())
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;

    use windows_sys::Win32::Graphics::Gdi::{DeleteObject, GetDC, GetDIBits, ReleaseDC, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS};
    use windows_sys::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};
    use windows_sys::Win32::UI::Shell::SHDefExtractIconW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO};

    const SIZE: u32 = 256;

    fn wide(s: &std::ffi::OsStr) -> Vec<u16> {
        s.encode_wide().chain(std::iter::once(0)).collect()
    }

    pub fn product_name(path: &Path) -> Option<String> {
        let file = wide(path.as_os_str());
        unsafe {
            let size = GetFileVersionInfoSizeW(file.as_ptr(), std::ptr::null_mut());
            if size == 0 {
                return None;
            }
            let mut data = vec![0u8; size as usize];
            if GetFileVersionInfoW(file.as_ptr(), 0, size, data.as_mut_ptr().cast()) == 0 {
                return None;
            }
            let query = |key: &str| -> Option<String> {
                let sub = wide(std::ffi::OsStr::new(key));
                let mut ptr: *mut core::ffi::c_void = std::ptr::null_mut();
                let mut len: u32 = 0;
                if VerQueryValueW(data.as_ptr().cast(), sub.as_ptr(), &mut ptr, &mut len) == 0 || ptr.is_null() || len == 0 {
                    return None;
                }
                Some((ptr, len))
                    .map(|(p, l)| std::slice::from_raw_parts(p as *const u16, l as usize))
                    .map(|s| String::from_utf16_lossy(s).trim_end_matches('\0').trim().to_string())
                    .filter(|s| !s.is_empty())
            };
            let mut ptr: *mut core::ffi::c_void = std::ptr::null_mut();
            let mut len: u32 = 0;
            let sub = wide(std::ffi::OsStr::new("\\VarFileInfo\\Translation"));
            let code = if VerQueryValueW(data.as_ptr().cast(), sub.as_ptr(), &mut ptr, &mut len) != 0 && len >= 4 && !ptr.is_null() {
                let pair = std::slice::from_raw_parts(ptr as *const u16, 2);
                format!("{:04x}{:04x}", pair[0], pair[1])
            } else {
                "040904b0".to_string()
            };
            query(&format!("\\StringFileInfo\\{code}\\ProductName")).or_else(|| query(&format!("\\StringFileInfo\\{code}\\FileDescription")))
        }
    }

    pub fn icon_png(path: &Path) -> Option<Vec<u8>> {
        let file = wide(path.as_os_str());
        unsafe {
            let mut large: HICON = std::ptr::null_mut();
            if SHDefExtractIconW(file.as_ptr(), 0, 0, &mut large, std::ptr::null_mut(), SIZE) != 0 || large.is_null() {
                return None;
            }
            let pixels = bgra(large);
            DestroyIcon(large);
            let mut rgba = pixels?;
            let opaque = rgba.chunks(4).any(|p| p[3] != 0);
            for p in rgba.chunks_mut(4) {
                p.swap(0, 2);
                if !opaque {
                    p[3] = 255;
                }
            }
            let image = image::RgbaImage::from_raw(SIZE, SIZE, rgba)?;
            let mut out = std::io::Cursor::new(Vec::new());
            image.write_to(&mut out, image::ImageFormat::Png).ok()?;
            Some(out.into_inner())
        }
    }

    unsafe fn bgra(icon: HICON) -> Option<Vec<u8>> {
        let mut info: ICONINFO = std::mem::zeroed();
        if GetIconInfo(icon, &mut info) == 0 {
            return None;
        }
        let mut header: BITMAPINFO = std::mem::zeroed();
        header.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        header.bmiHeader.biWidth = SIZE as i32;
        header.bmiHeader.biHeight = -(SIZE as i32);
        header.bmiHeader.biPlanes = 1;
        header.bmiHeader.biBitCount = 32;
        header.bmiHeader.biCompression = BI_RGB;
        let mut buf = vec![0u8; (SIZE * SIZE * 4) as usize];
        let dc = GetDC(std::ptr::null_mut());
        let lines = GetDIBits(dc, info.hbmColor, 0, SIZE, buf.as_mut_ptr().cast(), &mut header, DIB_RGB_COLORS);
        ReleaseDC(std::ptr::null_mut(), dc);
        DeleteObject(info.hbmColor);
        DeleteObject(info.hbmMask);
        (lines == SIZE as i32).then_some(buf)
    }
}
