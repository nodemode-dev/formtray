#![cfg(all(unix, not(target_os = "macos")))]

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, MutexGuard};

use formtray_core::identity::{self, linux};
use formtray_core::Registry;

static ENV: Mutex<()> = Mutex::new(());

struct Home {
    _lock: MutexGuard<'static, ()>,
    root: PathBuf,
}

impl Home {
    fn new(tag: &str) -> Home {
        let lock = ENV.lock().unwrap_or_else(|e| e.into_inner());
        static N: AtomicUsize = AtomicUsize::new(0);
        let root = std::env::temp_dir().join(format!("formtray-identity-{}-{tag}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = std::fs::remove_dir_all(&root);
        for dir in ["home", "data/applications", "system", "cache"] {
            std::fs::create_dir_all(root.join(dir)).unwrap();
        }
        std::env::set_var("HOME", root.join("home"));
        std::env::set_var("XDG_DATA_HOME", root.join("data"));
        std::env::set_var("XDG_DATA_DIRS", root.join("system"));
        std::env::set_var("XDG_CONFIG_HOME", root.join("home/.config"));
        Home { _lock: lock, root }
    }

    fn path(&self, rel: &str) -> PathBuf {
        self.root.join(rel)
    }

    fn desktop(&self, file: &str, text: &str) {
        std::fs::write(self.path("data/applications").join(file), text).unwrap();
    }
}

impl Drop for Home {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn png(w: u32, h: u32, rgba: [u8; 4]) -> Vec<u8> {
    let image = image::RgbaImage::from_pixel(w, h, image::Rgba(rgba));
    let mut out = std::io::Cursor::new(Vec::new());
    image.write_to(&mut out, image::ImageFormat::Png).unwrap();
    out.into_inner()
}

fn dims(bytes: &[u8]) -> (u32, u32) {
    assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
    (u32::from_be_bytes(bytes[16..20].try_into().unwrap()), u32::from_be_bytes(bytes[20..24].try_into().unwrap()))
}

fn icns(chunks: &[(&[u8; 4], Vec<u8>)]) -> Vec<u8> {
    let mut body = Vec::new();
    for (kind, data) in chunks {
        body.extend_from_slice(*kind);
        body.extend_from_slice(&((data.len() + 8) as u32).to_be_bytes());
        body.extend_from_slice(data);
    }
    let mut out = b"icns".to_vec();
    out.extend_from_slice(&((body.len() + 8) as u32).to_be_bytes());
    out.extend(body);
    out
}

fn app(id: &str) -> formtray_core::AppEntry {
    Registry::load().get(id).unwrap().clone()
}

#[test]
fn a_live_name_without_the_form_prefix_gets_it_and_is_lower_cased() {
    assert_eq!(identity::form_name(None, "Widget").as_deref(), Some("formwidget"));
    assert_eq!(identity::form_name(None, "FORMTool").as_deref(), Some("formtool"));
    assert_eq!(identity::form_name(None, "  Spacey  ").as_deref(), Some("formspacey"));
}

#[test]
fn a_blank_live_name_gives_no_name() {
    assert_eq!(identity::form_name(None, ""), None);
    assert_eq!(identity::form_name(None, "   \t"), None);
}

#[test]
fn a_live_name_that_matches_a_registry_name_is_shown_as_the_registry_spelling() {
    let cut = app("formcut");
    assert_eq!(identity::form_name(Some(&cut), "cut").as_deref(), Some(cut.name.as_str()));
    assert_eq!(identity::form_name(Some(&cut), "FORMCUT").as_deref(), Some(cut.name.as_str()));
    assert_eq!(identity::form_name(Some(&cut), "formcut").as_deref(), Some("FormCut"));
}

#[test]
fn a_live_name_that_matches_no_registry_name_is_prefixed_and_lower_cased() {
    let cut = app("formcut");
    assert_eq!(identity::form_name(Some(&cut), "Photoshop").as_deref(), Some("formphotoshop"));
}

#[test]
fn a_name_shorter_than_the_prefix_is_not_taken_for_prefixed() {
    assert_eq!(identity::form_name(None, "for").as_deref(), Some("formfor"));
}

#[test]
fn a_desktop_entry_gives_its_name_and_icon_from_the_main_section_only() {
    let text = "[Desktop Action new]\nName=Wrong\nIcon=wrong\n\n[Desktop Entry]\nName= Cut Pro \nIcon=cutter\nExec=formcut\n\n[Desktop Action more]\nName=Also wrong\n";
    let entry = linux::parse(text);
    assert_eq!(entry.name.as_deref(), Some("Cut Pro"));
    assert_eq!(entry.icon.as_deref(), Some("cutter"));
}

#[test]
fn a_desktop_entry_with_empty_values_has_none() {
    let entry = linux::parse("[Desktop Entry]\nName=\nIcon=   \n");
    assert!(entry.name.is_none());
    assert!(entry.icon.is_none());
}

#[test]
fn an_installed_app_is_read_through_its_desktop_entry_and_its_icon_is_cached_as_a_png() {
    let h = Home::new("read");
    let icon = h.path("home/cut.png");
    std::fs::write(&icon, png(64, 64, [200, 0, 0, 255])).unwrap();
    h.desktop("formcut.desktop", &format!("[Desktop Entry]\nName=Cut Pro\nIcon={}\nExec=/opt/formcut/formcut %U\n", icon.display()));
    let id = identity::read_into(&app("formcut"), Path::new("/opt/formcut/formcut"), &h.path("cache"));
    assert_eq!(id.name.as_deref(), Some("Cut Pro"));
    let file = id.icon.expect("an icon file name");
    assert!(file.starts_with("formcut-") && file.ends_with(".png"), "{file}");
    let cached = std::fs::read(h.path("cache").join(&file)).unwrap();
    assert_eq!(dims(&cached), (64, 64));
}

#[test]
fn reading_the_same_unchanged_icon_twice_gives_the_same_cache_file() {
    let h = Home::new("stable");
    let icon = h.path("home/cut.png");
    std::fs::write(&icon, png(32, 32, [0, 200, 0, 255])).unwrap();
    h.desktop("formcut.desktop", &format!("[Desktop Entry]\nName=Cut\nIcon={}\nExec=formcut\n", icon.display()));
    let first = identity::read_into(&app("formcut"), Path::new("/x/formcut"), &h.path("cache")).icon.unwrap();
    let second = identity::read_into(&app("formcut"), Path::new("/x/formcut"), &h.path("cache")).icon.unwrap();
    assert_eq!(first, second);
    assert_eq!(std::fs::read_dir(h.path("cache")).unwrap().count(), 1);
}

#[test]
fn a_changed_icon_gets_a_new_cache_name_and_the_old_one_is_removed() {
    let h = Home::new("prune");
    let icon = h.path("home/cut.png");
    std::fs::write(&icon, png(32, 32, [0, 200, 0, 255])).unwrap();
    h.desktop("formcut.desktop", &format!("[Desktop Entry]\nName=Cut\nIcon={}\nExec=formcut\n", icon.display()));
    let old = identity::read_into(&app("formcut"), Path::new("/x/formcut"), &h.path("cache")).icon.unwrap();
    std::fs::write(&icon, png(48, 48, [0, 0, 200, 255])).unwrap();
    let new = identity::read_into(&app("formcut"), Path::new("/x/formcut"), &h.path("cache")).icon.unwrap();
    assert_ne!(old, new);
    assert!(!h.path("cache").join(&old).exists());
    assert_eq!(dims(&std::fs::read(h.path("cache").join(&new)).unwrap()), (48, 48));
}

#[test]
fn an_icon_larger_than_512_is_cached_scaled_down_to_fit_512() {
    let h = Home::new("big");
    let icon = h.path("home/big.png");
    std::fs::write(&icon, png(1024, 768, [10, 20, 30, 255])).unwrap();
    h.desktop("formcut.desktop", &format!("[Desktop Entry]\nName=Cut\nIcon={}\nExec=formcut\n", icon.display()));
    let file = identity::read_into(&app("formcut"), Path::new("/x/formcut"), &h.path("cache")).icon.unwrap();
    assert_eq!(dims(&std::fs::read(h.path("cache").join(file)).unwrap()), (512, 384));
}

#[test]
fn an_svg_icon_is_cached_byte_for_byte_as_an_svg() {
    let h = Home::new("svg");
    let icon = h.path("home/cut.svg");
    let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"8\" height=\"8\"/>";
    std::fs::write(&icon, svg).unwrap();
    h.desktop("formcut.desktop", &format!("[Desktop Entry]\nName=Cut\nIcon={}\nExec=formcut\n", icon.display()));
    let file = identity::read_into(&app("formcut"), Path::new("/x/formcut"), &h.path("cache")).icon.unwrap();
    assert!(file.ends_with(".svg"), "{file}");
    assert_eq!(std::fs::read_to_string(h.path("cache").join(file)).unwrap(), svg);
}

#[test]
fn an_icon_given_by_theme_name_is_found_in_the_largest_hicolor_size_first() {
    let h = Home::new("theme");
    for size in ["48x48", "256x256", "128x128"] {
        let dir = h.path("data/icons/hicolor").join(size).join("apps");
        std::fs::create_dir_all(&dir).unwrap();
        let side: u32 = size.split('x').next().unwrap().parse().unwrap();
        std::fs::write(dir.join("cutter.png"), png(side, side, [1, 2, 3, 255])).unwrap();
    }
    h.desktop("formcut.desktop", "[Desktop Entry]\nName=Cut\nIcon=cutter\nExec=formcut\n");
    let file = identity::read_into(&app("formcut"), Path::new("/x/formcut"), &h.path("cache")).icon.unwrap();
    assert_eq!(dims(&std::fs::read(h.path("cache").join(file)).unwrap()), (256, 256));
}

#[test]
fn a_named_icon_that_is_nowhere_gives_a_name_but_no_icon() {
    let h = Home::new("noicon");
    h.desktop("formcut.desktop", "[Desktop Entry]\nName=Cut\nIcon=not-installed-anywhere-zz\nExec=formcut\n");
    let id = identity::read_into(&app("formcut"), Path::new("/x/formcut"), &h.path("cache"));
    assert_eq!(id.name.as_deref(), Some("Cut"));
    assert!(id.icon.is_none());
}

#[test]
fn an_app_with_no_desktop_entry_has_no_live_name_and_no_icon() {
    let h = Home::new("none");
    let id = identity::read_into(&app("formcut"), Path::new("/x/formcut"), &h.path("cache"));
    assert!(id.name.is_none() && id.icon.is_none());
}

#[test]
fn a_desktop_entry_for_another_program_is_not_used() {
    let h = Home::new("other");
    h.desktop("somethingelse.desktop", "[Desktop Entry]\nName=Other\nIcon=x\nExec=/usr/bin/other\n");
    let id = identity::read_into(&app("formcut"), Path::new("/x/formcut"), &h.path("cache"));
    assert!(id.name.is_none());
}

#[test]
fn a_desktop_entry_is_matched_by_its_file_name_when_its_exec_is_a_wrapper() {
    let h = Home::new("wrapper");
    h.desktop("FormCut.desktop", "[Desktop Entry]\nName=Cut Wrapped\nExec=env GDK_BACKEND=x11 run.sh\n");
    let id = identity::read_into(&app("formcut"), Path::new("/x/unrelated"), &h.path("cache"));
    assert_eq!(id.name.as_deref(), Some("Cut Wrapped"));
}

#[test]
fn the_largest_png_up_to_512_is_picked_from_an_icns_file() {
    let h = Home::new("icns");
    let file = h.path("a.icns");
    std::fs::write(&file, icns(&[(b"ic07", png(64, 64, [9, 9, 9, 255])), (b"ic08", png(256, 256, [8, 8, 8, 255])), (b"ic09", png(512, 512, [7, 7, 7, 255]))])).unwrap();
    assert_eq!(dims(&identity::icns_png(&file).unwrap()), (512, 512));
}

#[test]
fn an_icns_with_a_1024_png_and_a_smaller_one_uses_the_smaller_one() {
    let h = Home::new("icns2");
    let file = h.path("a.icns");
    std::fs::write(&file, icns(&[(b"ic10", png(1024, 1024, [9, 9, 9, 255])), (b"ic08", png(256, 256, [8, 8, 8, 255]))])).unwrap();
    assert_eq!(dims(&identity::icns_png(&file).unwrap()), (256, 256));
}

#[test]
fn an_icns_with_only_a_1024_png_is_scaled_down_to_512() {
    let h = Home::new("icns3");
    let file = h.path("a.icns");
    std::fs::write(&file, icns(&[(b"ic10", png(1024, 1024, [9, 9, 9, 255]))])).unwrap();
    assert_eq!(dims(&identity::icns_png(&file).unwrap()), (512, 512));
}

#[test]
fn a_file_that_is_not_an_icns_or_has_no_png_gives_nothing() {
    let h = Home::new("icns4");
    std::fs::write(h.path("a.icns"), b"not an icon at all").unwrap();
    assert!(identity::icns_png(&h.path("a.icns")).is_none());
    std::fs::write(h.path("b.icns"), icns(&[(b"is32", vec![1, 2, 3, 4, 5, 6, 7, 8, 9])])).unwrap();
    assert!(identity::icns_png(&h.path("b.icns")).is_none());
    assert!(identity::icns_png(&h.path("missing.icns")).is_none());
}

#[test]
fn a_truncated_icns_does_not_panic_and_gives_nothing() {
    let h = Home::new("icns5");
    let mut data = icns(&[(b"ic08", png(256, 256, [8, 8, 8, 255]))]);
    data.truncate(data.len() / 2);
    std::fs::write(h.path("c.icns"), data).unwrap();
    assert!(identity::icns_png(&h.path("c.icns")).is_none());
}

#[test]
fn a_menu_icon_is_a_36_pixel_copy_made_beside_the_original() {
    let h = Home::new("menu");
    let cache = h.path("cache");
    std::fs::write(cache.join("formcut-1.png"), png(200, 100, [5, 5, 5, 255])).unwrap();
    let small = identity::menu_icon(&cache, "formcut-1.png").unwrap();
    assert_eq!(small, cache.join("formcut-1-m.png"));
    let (w, hgt) = dims(&std::fs::read(&small).unwrap());
    assert_eq!((w, hgt), (identity::MENU_PX, identity::MENU_PX / 2));
    assert_eq!(identity::MENU_PX, 36);
}

#[test]
fn a_menu_icon_that_exists_is_reused_not_rewritten() {
    let h = Home::new("menu2");
    let cache = h.path("cache");
    std::fs::write(cache.join("a-1.png"), png(100, 100, [5, 5, 5, 255])).unwrap();
    std::fs::write(cache.join("a-1-m.png"), b"already there").unwrap();
    let small = identity::menu_icon(&cache, "a-1.png").unwrap();
    assert_eq!(std::fs::read(small).unwrap(), b"already there");
}

#[test]
fn a_menu_icon_is_only_made_for_png_files_that_exist() {
    let h = Home::new("menu3");
    let cache = h.path("cache");
    std::fs::write(cache.join("a-1.svg"), "<svg/>").unwrap();
    assert!(identity::menu_icon(&cache, "a-1.svg").is_none());
    assert!(identity::menu_icon(&cache, "gone.png").is_none());
    std::fs::write(cache.join("broken.png"), b"not a png").unwrap();
    assert!(identity::menu_icon(&cache, "broken.png").is_none());
}

#[test]
fn the_hue_of_a_solid_red_icon_is_that_red() {
    let h = Home::new("hue");
    std::fs::write(h.path("cache/r.png"), png(40, 40, [200, 20, 10, 255])).unwrap();
    assert_eq!(identity::hue(&h.path("cache"), "r.png").as_deref(), Some("#c8140a"));
}

#[test]
fn a_grey_or_transparent_icon_has_no_hue() {
    let h = Home::new("hue2");
    std::fs::write(h.path("cache/g.png"), png(40, 40, [120, 120, 120, 255])).unwrap();
    std::fs::write(h.path("cache/t.png"), png(40, 40, [250, 0, 0, 0])).unwrap();
    assert!(identity::hue(&h.path("cache"), "g.png").is_none());
    assert!(identity::hue(&h.path("cache"), "t.png").is_none());
    assert!(identity::hue(&h.path("cache"), "absent.png").is_none());
}

#[test]
fn the_hue_ignores_grey_pixels_around_a_coloured_spot() {
    let h = Home::new("hue3");
    let mut image = image::RgbaImage::from_pixel(32, 32, image::Rgba([128, 128, 128, 255]));
    for x in 0..16 {
        for y in 0..32 {
            image.put_pixel(x, y, image::Rgba([0, 0, 220, 255]));
        }
    }
    image.save(h.path("cache/half.png")).unwrap();
    assert_eq!(identity::hue(&h.path("cache"), "half.png").as_deref(), Some("#0000dc"));
}
