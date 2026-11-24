#![cfg(all(unix, not(target_os = "macos")))]

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, MutexGuard};

use formtray_core::portal::{self, read_at, Record};
use formtray_core::verify::{check, refusal, Cache, Verdict};
use formtray_core::{discover, Engine, Registry};
use sha2::{Digest, Sha256};

static ENV: Mutex<()> = Mutex::new(());

struct Dir {
    root: PathBuf,
}

impl Dir {
    fn new(tag: &str) -> Dir {
        static N: AtomicUsize = AtomicUsize::new(0);
        let root = std::env::temp_dir().join(format!("formtray-disc-{}-{tag}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        Dir { root }
    }

    fn path(&self, rel: &str) -> PathBuf {
        self.root.join(rel)
    }

    fn file(&self, rel: &str, body: &str) -> PathBuf {
        let p = self.path(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, body).unwrap();
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
        p
    }
}

impl Drop for Dir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn app(id: &str) -> formtray_core::AppEntry {
    Registry::load().get(id).unwrap().clone()
}

#[test]
fn a_program_named_after_the_app_is_found_in_a_search_folder() {
    let d = Dir::new("plain");
    let program = d.file("bin/formcut", "x");
    d.file("bin/otherapp", "x");
    assert_eq!(discover::find(&app("formcut"), &[d.path("bin")]), Some(program));
}

#[test]
fn the_program_name_is_matched_ignoring_case() {
    let d = Dir::new("case");
    let program = d.file("bin/FORMCUT", "x");
    assert_eq!(discover::find(&app("formcut"), &[d.path("bin")]), Some(program));
}

#[test]
fn an_appimage_is_found_by_the_name_before_the_version() {
    let d = Dir::new("appimage");
    let program = d.file("apps/FormWav-1.4.2-x86_64.AppImage", "x");
    assert_eq!(discover::find(&app("formwav"), &[d.path("apps")]), Some(program.clone()));
    let d2 = Dir::new("appimage2");
    let program2 = d2.file("apps/formwav_1.4.2.appimage", "x");
    assert_eq!(discover::find(&app("formwav"), &[d2.path("apps")]), Some(program2));
}

#[test]
fn a_versioned_name_without_appimage_is_not_taken_for_the_app() {
    let d = Dir::new("versioned");
    d.file("apps/formwav-1.4.2", "x");
    assert_eq!(discover::find(&app("formwav"), &[d.path("apps")]), None);
}

#[test]
fn an_app_in_a_folder_one_level_down_is_found_but_two_levels_down_is_not() {
    let d = Dir::new("depth");
    let near = d.file("root/tools/formpdf", "x");
    assert_eq!(discover::find(&app("formpdf"), &[d.path("root")]), Some(near));
    let far = Dir::new("depth2");
    far.file("root/a/b/formpdf", "x");
    assert_eq!(discover::find(&app("formpdf"), &[far.path("root")]), None);
}

#[test]
fn the_first_search_folder_with_the_app_wins() {
    let d = Dir::new("first");
    let first = d.file("one/formcut", "x");
    d.file("two/formcut", "x");
    assert_eq!(discover::find(&app("formcut"), &[d.path("one"), d.path("two")]), Some(first));
    assert_eq!(discover::find(&app("formcut"), &[d.path("missing"), d.path("two")]), Some(d.path("two/formcut")));
}

#[test]
fn a_search_over_empty_or_missing_folders_finds_nothing() {
    let d = Dir::new("empty");
    std::fs::create_dir_all(d.path("empty")).unwrap();
    assert_eq!(discover::find(&app("formcut"), &[d.path("empty"), d.path("absent")]), None);
    assert_eq!(discover::find(&app("formcut"), &[]), None);
}

#[test]
fn one_app_is_not_mistaken_for_another_with_a_longer_name() {
    let d = Dir::new("similar");
    d.file("bin/formcutter", "x");
    d.file("bin/formcut2", "x");
    assert_eq!(discover::find(&app("formcut"), &[d.path("bin")]), None);
}

#[test]
fn a_desktop_entry_whose_exec_is_an_existing_program_leads_to_that_program() {
    let d = Dir::new("desktop");
    let program = d.file("opt/anywhere/formmd", "x");
    d.file("applications/formmd.desktop", &format!("[Desktop Entry]\nName=MD\nExec={} %F\n", program.display()));
    assert_eq!(discover::find(&app("formmd"), &[d.path("applications")]), Some(program));
}

#[test]
fn a_desktop_entry_whose_program_does_not_exist_leads_nowhere() {
    let d = Dir::new("desktop2");
    d.file("applications/formmd.desktop", "[Desktop Entry]\nName=MD\nExec=/nowhere/at/all/formmd\n");
    assert_eq!(discover::find(&app("formmd"), &[d.path("applications")]), None);
}

#[test]
fn a_desktop_entry_for_a_different_program_is_ignored() {
    let d = Dir::new("desktop3");
    let program = d.file("opt/editor", "x");
    d.file("applications/editor.desktop", &format!("[Desktop Entry]\nExec={}\n", program.display()));
    assert_eq!(discover::find(&app("formmd"), &[d.path("applications")]), None);
}

#[test]
fn resolving_a_folder_scans_it_and_resolving_a_file_gives_the_file() {
    let d = Dir::new("resolve");
    let program = d.file("install/formcut", "x");
    assert_eq!(discover::resolve(&app("formcut"), &d.path("install")), Some(program.clone()));
    assert_eq!(discover::resolve(&app("formcut"), &program), Some(program));
}

#[test]
fn resolving_a_path_that_does_not_exist_gives_nothing() {
    let d = Dir::new("resolve2");
    assert_eq!(discover::resolve(&app("formcut"), &d.path("never")), None);
}

#[test]
fn resolving_a_folder_without_the_program_gives_nothing() {
    let d = Dir::new("resolve3");
    d.file("install/readme.txt", "x");
    assert_eq!(discover::resolve(&app("formcut"), &d.path("install")), None);
}

#[test]
fn search_roots_keep_the_given_folders_first_and_drop_ones_that_are_not_folders() {
    let d = Dir::new("roots");
    std::fs::create_dir_all(d.path("mine")).unwrap();
    let file = d.file("afile", "x");
    let roots = discover::search_roots(&[d.path("mine"), d.path("ghost"), file]);
    assert_eq!(roots.first(), Some(&d.path("mine")));
    assert!(!roots.contains(&d.path("ghost")));
    assert!(roots.iter().all(|r| r.is_dir()));
}

#[test]
fn search_roots_include_the_home_applications_folder_when_it_exists() {
    let _lock: MutexGuard<'static, ()> = ENV.lock().unwrap_or_else(|e| e.into_inner());
    let d = Dir::new("homeroots");
    std::fs::create_dir_all(d.path("home/Applications")).unwrap();
    std::env::set_var("HOME", d.path("home"));
    assert!(discover::search_roots(&[]).contains(&d.path("home/Applications")));
}

fn portal_root(d: &Dir, installed: &str, catalog: Option<&str>) -> PathBuf {
    d.file("portal/installed.json", installed);
    if let Some(c) = catalog {
        d.file("portal/catalog/apps.json", c);
    }
    d.path("portal")
}

fn stable_install(product: &str, version: &str) -> String {
    format!(r#"{{"product":"{product}","channel":"stable","current":{{"version":"{version}","path":"/apps/{product}"}}}}"#)
}

fn product(id: &str, name: &str, version: &str, platform: &str) -> String {
    format!(r#"{{"id":"{id}","name":"{name}","channels":{{"stable":{{"version":"{version}","artifacts":[{{"platform":"{platform}"}}]}}}}}}"#)
}

#[test]
fn a_portal_folder_without_installed_json_reads_as_not_found() {
    let d = Dir::new("noportal");
    let state = read_at(&d.path("nothing"));
    assert!(!state.found);
    assert!(state.installs.is_empty() && state.updates.is_empty() && state.names.is_empty());
}

#[test]
fn an_installed_json_that_is_not_json_reads_as_not_found() {
    let d = Dir::new("badportal");
    let root = portal_root(&d, "{ this is not json", None);
    assert!(!read_at(&root).found);
}

#[test]
fn an_empty_install_list_is_found_with_nothing_installed() {
    let d = Dir::new("emptyportal");
    let root = portal_root(&d, r#"{"installs":[]}"#, None);
    let state = read_at(&root);
    assert!(state.found);
    assert!(state.installs.is_empty());
}

#[test]
fn a_stable_install_gives_its_folder_and_a_record_under_the_family_id() {
    let d = Dir::new("install");
    let root = portal_root(&d, &format!(r#"{{"installs":[{}]}}"#, stable_install("formslide", "2.0.0")), None);
    let state = read_at(&root);
    assert_eq!(state.installs, vec![("formdeck".to_string(), PathBuf::from("/apps/formslide"))]);
    let record = state.records.get("formdeck").unwrap();
    assert_eq!((record.product.as_str(), record.version.as_str()), ("formslide", "2.0.0"));
    assert!(record.files.is_none());
}

#[test]
fn only_the_stable_channel_is_read() {
    let d = Dir::new("beta");
    let beta = r#"{"product":"formcut","channel":"beta","current":{"version":"9.0.0","path":"/apps/beta"}}"#;
    let root = portal_root(&d, &format!(r#"{{"installs":[{beta},{}]}}"#, stable_install("formwav", "1.0.0")), None);
    let state = read_at(&root);
    assert_eq!(state.installs.len(), 1);
    assert_eq!(state.installs[0].0, "formwav");
}

#[test]
fn the_four_renamed_products_map_to_their_family_ids_and_others_stay() {
    assert_eq!(portal::family_id("formai"), "formportal");
    assert_eq!(portal::family_id("formslide"), "formdeck");
    assert_eq!(portal::family_id("formranker"), "formbench");
    assert_eq!(portal::family_id("formskill"), "formskills");
    assert_eq!(portal::family_id("formcut"), "formcut");
}

#[test]
fn the_catalogue_gives_names_and_skips_blank_ones() {
    let d = Dir::new("names");
    let platform = Engine::platform();
    let catalog = format!(r#"{{"products":[{},{},{}]}}"#, product("formai", " FormPortal Pro ", "1.0.0", platform), product("formcut", "   ", "1.0.0", platform), product("formwav", "Wav Studio", "1.0.0", platform));
    let root = portal_root(&d, r#"{"installs":[]}"#, Some(&catalog));
    let state = read_at(&root);
    assert_eq!(state.names.get("formportal").map(String::as_str), Some("FormPortal Pro"));
    assert_eq!(state.names.get("formwav").map(String::as_str), Some("Wav Studio"));
    assert!(!state.names.contains_key("formcut"));
}

#[test]
fn a_product_is_released_only_with_a_stable_build_for_this_platform() {
    let d = Dir::new("released");
    let platform = Engine::platform();
    let other = if platform == "windows" { "macos" } else { "windows" };
    let catalog = format!(r#"{{"products":[{},{}]}}"#, product("formcut", "FormCut", "1.0.0", platform), product("formwav", "FormWav", "1.0.0", other));
    let root = portal_root(&d, r#"{"installs":[]}"#, Some(&catalog));
    assert_eq!(read_at(&root).released, vec!["formcut".to_string()]);
}

#[test]
fn a_newer_catalogue_version_is_reported_as_an_update() {
    let d = Dir::new("update");
    let catalog = format!(r#"{{"products":[{}]}}"#, product("formcut", "FormCut", "1.10.0", Engine::platform()));
    let root = portal_root(&d, &format!(r#"{{"installs":[{}]}}"#, stable_install("formcut", "1.9.0")), Some(&catalog));
    let updates = read_at(&root).updates;
    assert_eq!(updates.len(), 1);
    assert_eq!((updates[0].id.as_str(), updates[0].from.as_str(), updates[0].to.as_str()), ("formcut", "1.9.0", "1.10.0"));
}

#[test]
fn the_same_or_an_older_catalogue_version_is_not_an_update() {
    let d = Dir::new("noupdate");
    let catalog = format!(r#"{{"products":[{},{}]}}"#, product("formcut", "FormCut", "1.9.0", Engine::platform()), product("formwav", "FormWav", "0.9.0", Engine::platform()));
    let installs = format!("{},{}", stable_install("formcut", "1.9.0"), stable_install("formwav", "1.0.0"));
    let root = portal_root(&d, &format!(r#"{{"installs":[{installs}]}}"#), Some(&catalog));
    assert!(read_at(&root).updates.is_empty());
}

#[test]
fn a_newer_version_built_only_for_another_platform_is_not_an_update() {
    let d = Dir::new("otherplatform");
    let other = if Engine::platform() == "windows" { "macos" } else { "windows" };
    let catalog = format!(r#"{{"products":[{}]}}"#, product("formcut", "FormCut", "5.0.0", other));
    let root = portal_root(&d, &format!(r#"{{"installs":[{}]}}"#, stable_install("formcut", "1.0.0")), Some(&catalog));
    assert!(read_at(&root).updates.is_empty());
}

#[test]
fn an_install_is_still_read_when_the_catalogue_is_missing_or_broken() {
    let d = Dir::new("nocatalog");
    let installed = format!(r#"{{"installs":[{}]}}"#, stable_install("formcut", "1.0.0"));
    let root = portal_root(&d, &installed, Some("<<broken"));
    let state = read_at(&root);
    assert!(state.found);
    assert_eq!(state.installs.len(), 1);
    assert!(state.names.is_empty() && state.released.is_empty() && state.updates.is_empty());
}

#[test]
fn version_comparison_orders_each_part_by_number_not_text() {
    assert!(portal::newer("1.10.0", "1.9.0"));
    assert!(!portal::newer("1.9.0", "1.10.0"));
    assert!(portal::newer("2", "1.99.99"));
    assert!(portal::newer("1.0.1", "1.0"));
}

#[test]
fn version_comparison_ignores_a_leading_v_a_suffix_and_trailing_zeros() {
    assert!(!portal::newer("v2.0", "2.0.0"));
    assert!(!portal::newer("1.2.3-beta.1", "1.2.3"));
    assert!(!portal::newer("1.2.3+build5", "1.2.3"));
    assert!(!portal::newer("1.2.3", "1.2.3"));
    assert!(portal::newer("1.2.4-rc1", "1.2.3"));
}

#[test]
fn the_portal_folder_can_be_set_by_formportal_root_or_follows_xdg_data_home() {
    let _lock = ENV.lock().unwrap_or_else(|e| e.into_inner());
    std::env::set_var("FORMPORTAL_ROOT", "/tmp/somewhere/portal");
    assert_eq!(portal::root(), PathBuf::from("/tmp/somewhere/portal"));
    std::env::remove_var("FORMPORTAL_ROOT");
    std::env::set_var("XDG_DATA_HOME", "/tmp/xdg-data");
    assert_eq!(portal::root(), PathBuf::from("/tmp/xdg-data/formportal"));
}

struct Install {
    d: Dir,
    record: Record,
}

impl Install {
    fn new(tag: &str, program: &[u8]) -> Install {
        let d = Dir::new(tag);
        let folder = d.path("apps/formcut/stable/1.2.3");
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("formcut"), program).unwrap();
        let hash: String = Sha256::digest(program).iter().map(|b| format!("{b:02x}")).collect();
        let files = d.path("apps/formcut/stable/1.2.3.files.json");
        std::fs::write(&files, serde_json::json!({"format": "formportal-files", "product": "formcut", "version": "1.2.3", "files": {"formcut": hash}}).to_string()).unwrap();
        let record = Record { product: "formcut".into(), version: "1.2.3".into(), folder, files: Some(files) };
        Install { d, record }
    }

    fn program(&self) -> PathBuf {
        self.record.folder.join("formcut")
    }

    fn rewrite_files(&self, value: serde_json::Value) {
        std::fs::write(self.record.files.as_ref().unwrap(), value.to_string()).unwrap();
    }
}

#[test]
fn a_hash_written_in_capitals_still_matches() {
    let i = Install::new("caps", b"program bytes");
    let hash: String = Sha256::digest(b"program bytes").iter().map(|b| format!("{b:02X}")).collect();
    i.rewrite_files(serde_json::json!({"format": "formportal-files", "product": "formcut", "version": "1.2.3", "files": {"formcut": hash}}));
    assert_eq!(check(Some(&i.record), &i.program(), &mut Cache::default()), Verdict::Matches);
}

#[test]
fn a_program_the_record_does_not_list_is_changed() {
    let i = Install::new("unlisted", b"program bytes");
    std::fs::write(i.record.folder.join("extra"), b"surprise").unwrap();
    assert_eq!(check(Some(&i.record), &i.record.folder.join("extra"), &mut Cache::default()), Verdict::Changed);
}

#[test]
fn a_program_outside_the_installed_folder_is_not_checked() {
    let i = Install::new("outside", b"program bytes");
    let elsewhere = i.d.file("elsewhere/formcut", "x");
    assert_eq!(check(Some(&i.record), &elsewhere, &mut Cache::default()), Verdict::Unrecorded);
}

#[test]
fn a_record_for_another_product_version_or_format_is_unreadable() {
    let i = Install::new("mismatch", b"program bytes");
    for (format, product, version) in [("formportal-files", "formwav", "1.2.3"), ("formportal-files", "formcut", "9.9.9"), ("other-format", "formcut", "1.2.3")] {
        i.rewrite_files(serde_json::json!({"format": format, "product": product, "version": version, "files": {}}));
        assert_eq!(check(Some(&i.record), &i.program(), &mut Cache::default()), Verdict::Unreadable, "{format} {product} {version}");
    }
}

#[test]
fn a_record_whose_files_list_is_absent_is_unrecorded() {
    let mut i = Install::new("nofiles", b"program bytes");
    i.record.files = None;
    assert_eq!(check(Some(&i.record), &i.program(), &mut Cache::default()), Verdict::Unrecorded);
    assert_eq!(check(None, &i.program(), &mut Cache::default()), Verdict::Unrecorded);
}

#[test]
fn a_record_pointing_at_a_file_that_is_gone_is_unrecorded() {
    let mut i = Install::new("gonefiles", b"program bytes");
    i.record.files = Some(i.d.path("no/such.files.json"));
    assert_eq!(check(Some(&i.record), &i.program(), &mut Cache::default()), Verdict::Unrecorded);
}

#[test]
fn a_link_in_the_install_matches_only_when_it_points_where_the_record_says() {
    let i = Install::new("link", b"program bytes");
    std::os::unix::fs::symlink("formcut", i.record.folder.join("alias")).unwrap();
    i.rewrite_files(serde_json::json!({"format": "formportal-files", "product": "formcut", "version": "1.2.3", "files": {"alias": "link:formcut"}}));
    assert_eq!(check(Some(&i.record), &i.record.folder.join("alias"), &mut Cache::default()), Verdict::Matches);
    i.rewrite_files(serde_json::json!({"format": "formportal-files", "product": "formcut", "version": "1.2.3", "files": {"alias": "link:somewhere-else"}}));
    assert_eq!(check(Some(&i.record), &i.record.folder.join("alias"), &mut Cache::default()), Verdict::Changed);
}

#[test]
fn a_changed_program_is_hashed_again_but_an_untouched_one_comes_from_the_cache() {
    let i = Install::new("cache", b"program bytes");
    let mut cache = Cache::default();
    for _ in 0..3 {
        assert_eq!(check(Some(&i.record), &i.program(), &mut cache), Verdict::Matches);
    }
    assert_eq!(cache.hashed, 1);
    std::fs::write(i.program(), b"program bytes but longer now").unwrap();
    assert_eq!(check(Some(&i.record), &i.program(), &mut cache), Verdict::Changed);
    assert_eq!(cache.hashed, 2);
}

#[test]
fn each_refusal_names_the_app_gives_its_reason_and_says_to_install_again() {
    let cases = [
        (Verdict::Changed, "its program file is not the one FormPortal installed"),
        (Verdict::Missing, "its program file is missing from the folder FormPortal installed it in"),
        (Verdict::Unreadable, "FormPortal's list of its files could not be read, so its program could not be checked"),
    ];
    for (verdict, reason) in cases {
        let text = refusal(verdict, "FormCut").unwrap();
        assert_eq!(text, format!("FormCut was not opened: {reason}. Install FormCut again with FormPortal."));
    }
    assert!(refusal(Verdict::Matches, "FormCut").is_none());
    assert!(refusal(Verdict::Unrecorded, "FormCut").is_none());
}

#[test]
fn a_program_that_is_gone_from_an_install_with_a_record_is_missing() {
    let i = Install::new("gone", b"program bytes");
    let ghost: &Path = &i.record.folder.join("formcut-gone");
    assert_eq!(check(Some(&i.record), ghost, &mut Cache::default()), Verdict::Missing);
}
