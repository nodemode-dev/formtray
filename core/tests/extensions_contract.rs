use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use formtray_core::extensions::{self, Extension};
use serde_json::{json, Value};

static NEXT: AtomicUsize = AtomicUsize::new(0);

struct Root(PathBuf);

impl Root {
    fn new() -> Root {
        let n = NEXT.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("formtray-ext-lane-{}-{n}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("extensions").join("formtray")).unwrap();
        Root(dir)
    }

    fn path(&self) -> &Path {
        &self.0
    }

    fn package(&self, folder: &str, manifest: &Value) -> PathBuf {
        let dir = self.0.join("packages").join(folder);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("manifest.json"), serde_json::to_vec(manifest).unwrap()).unwrap();
        std::fs::write(dir.join("index.html"), "<!doctype html><title>x</title>").unwrap();
        dir
    }

    fn dev(&self, rows: &[(&str, &Path)]) {
        let list: Vec<Value> = rows.iter().map(|(id, p)| json!({ "id": id, "path": p.display().to_string(), "added": "2026-11-07T10:00:00Z" })).collect();
        let doc = json!({ "format": "formext-dev-extensions", "format_version": 1, "product": "formtray", "extensions": list });
        std::fs::write(self.0.join("extensions/formtray/dev.json"), serde_json::to_vec(&doc).unwrap()).unwrap();
    }

    fn enabled(&self, rows: Vec<Value>) {
        let doc = json!({ "format": "formportal-enabled-extensions", "format_version": 1, "product": "formtray", "extensions": rows });
        std::fs::write(self.0.join("extensions/formtray/enabled.json"), serde_json::to_vec(&doc).unwrap()).unwrap();
    }

    fn list(&self) -> Vec<Extension> {
        extensions::resolve("formtray", "0.18.0", "FormTray", Some(&self.0))
    }

    fn dev_one(&self, manifest: Value) -> Extension {
        let dir = self.package("one", &manifest);
        self.dev(&[("hello", &dir)]);
        let mut all = self.list();
        assert_eq!(all.len(), 1);
        all.remove(0)
    }
}

impl Drop for Root {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn manifest(id: &str, version: &str) -> Value {
    json!({
        "format": "formai-package",
        "format_version": 1,
        "id": id,
        "name": "Hello",
        "version": version,
        "product": "formtray",
        "api": "1",
        "permissions": ["document"],
        "entry": { "ui": "index.html" },
        "contributes": {
            "panels": [{ "id": "main", "title": "Main" }],
            "commands": [{ "id": "greet", "title": "Say hello" }]
        }
    })
}

fn with(mut base: Value, key: &str, value: Value) -> Value {
    base.as_object_mut().unwrap().insert(key.to_string(), value);
    base
}

fn without(mut base: Value, key: &str) -> Value {
    base.as_object_mut().unwrap().remove(key);
    base
}

#[test]
fn a_folder_listed_in_dev_json_is_shown_as_a_ready_development_extension() {
    let root = Root::new();
    let ext = root.dev_one(manifest("hello", "1.2.3"));
    assert_eq!(ext.id, "hello");
    assert_eq!(ext.source, "development");
    assert_eq!(ext.state, "ready");
    assert_eq!(ext.reason, "");
    assert_eq!(ext.version, "1.2.3");
    assert_eq!(ext.name, "Hello");
}

#[test]
fn the_host_offers_contract_api_1_under_product_id_formtray() {
    assert_eq!(extensions::API, "1");
    assert_eq!(extensions::PRODUCT, "formtray");
}

#[test]
fn a_manifest_made_for_another_product_is_refused_and_the_reason_names_both() {
    let root = Root::new();
    let ext = root.dev_one(with(manifest("hello", "1.0.0"), "product", json!("formvis")));
    assert_eq!(ext.state, "refused");
    assert!(ext.reason.contains("formvis"), "{}", ext.reason);
    assert!(ext.reason.contains("FormTray"), "{}", ext.reason);
}

#[test]
fn a_manifest_without_a_product_is_refused() {
    let root = Root::new();
    let ext = root.dev_one(without(manifest("hello", "1.0.0"), "product"));
    assert_eq!(ext.state, "refused");
}

#[test]
fn a_manifest_asking_for_api_2_is_refused_and_told_the_host_offers_api_1() {
    let root = Root::new();
    let ext = root.dev_one(with(manifest("hello", "1.0.0"), "api", json!("2")));
    assert_eq!(ext.state, "refused");
    assert!(ext.reason.contains("API 2"), "{}", ext.reason);
    assert!(ext.reason.contains("API 1"), "{}", ext.reason);
}

#[test]
fn a_folder_without_a_manifest_is_listed_as_refused_not_dropped() {
    let root = Root::new();
    let dir = root.path().join("packages").join("empty");
    std::fs::create_dir_all(&dir).unwrap();
    root.dev(&[("hello", &dir)]);
    let all = root.list();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].state, "refused");
    assert!(all[0].reason.contains("manifest.json"), "{}", all[0].reason);
}

#[test]
fn a_manifest_that_is_not_json_is_refused() {
    let root = Root::new();
    let dir = root.package("one", &manifest("hello", "1.0.0"));
    std::fs::write(dir.join("manifest.json"), "{ not json").unwrap();
    root.dev(&[("hello", &dir)]);
    assert_eq!(root.list()[0].state, "refused");
}

#[test]
fn a_manifest_whose_id_differs_from_the_listed_id_is_refused() {
    let root = Root::new();
    let dir = root.package("one", &manifest("other", "1.0.0"));
    root.dev(&[("hello", &dir)]);
    let all = root.list();
    assert_eq!(all[0].state, "refused");
    assert!(all[0].reason.contains("other") && all[0].reason.contains("hello"), "{}", all[0].reason);
}

#[test]
fn a_manifest_of_another_package_format_is_refused() {
    let root = Root::new();
    let ext = root.dev_one(with(manifest("hello", "1.0.0"), "format", json!("something-else")));
    assert_eq!(ext.state, "refused");
}

#[test]
fn a_native_extension_is_refused() {
    let root = Root::new();
    let ext = root.dev_one(with(manifest("hello", "1.0.0"), "native", json!({ "linux": "lib.so" })));
    assert_eq!(ext.state, "refused");
    assert!(ext.reason.contains("native"), "{}", ext.reason);
}

#[test]
fn a_version_that_is_not_three_numbers_is_refused() {
    for bad in ["1.0", "1.0.0-beta", "v1.0.0", "1.0.0.0", "1..0"] {
        let root = Root::new();
        let ext = root.dev_one(manifest("hello", bad));
        assert_eq!(ext.state, "refused", "{bad}");
        assert!(ext.reason.contains("x.y.z"), "{}", ext.reason);
    }
}

#[test]
fn the_document_permission_is_accepted_and_reported() {
    let root = Root::new();
    let ext = root.dev_one(manifest("hello", "1.0.0"));
    assert_eq!(ext.permissions, vec!["document".to_string()]);
}

#[test]
fn a_permission_that_does_not_exist_is_refused() {
    let root = Root::new();
    let ext = root.dev_one(with(manifest("hello", "1.0.0"), "permissions", json!(["document", "everything"])));
    assert_eq!(ext.state, "refused");
    assert!(ext.reason.contains("permission"), "{}", ext.reason);
}

#[test]
fn a_permission_that_is_not_text_is_refused() {
    let root = Root::new();
    let ext = root.dev_one(with(manifest("hello", "1.0.0"), "permissions", json!(["document", 7])));
    assert_eq!(ext.state, "refused");
}

#[test]
fn a_permission_asked_for_twice_is_reported_once_in_the_order_asked() {
    let root = Root::new();
    let ext = root.dev_one(with(manifest("hello", "1.0.0"), "permissions", json!(["files-read", "document", "files-read"])));
    assert_eq!(ext.state, "ready");
    assert_eq!(ext.permissions, vec!["files-read".to_string(), "document".to_string()]);
}

#[test]
fn a_manifest_without_permissions_is_ready_with_none() {
    let root = Root::new();
    let ext = root.dev_one(without(manifest("hello", "1.0.0"), "permissions"));
    assert_eq!(ext.state, "ready");
    assert!(ext.permissions.is_empty());
}

#[test]
fn an_extension_needing_a_newer_app_is_refused_and_told_which_version() {
    let root = Root::new();
    let ext = root.dev_one(with(manifest("hello", "1.0.0"), "minimum_app", json!("0.19.0")));
    assert_eq!(ext.state, "refused");
    assert!(ext.reason.contains("0.19.0"), "{}", ext.reason);
}

#[test]
fn minimum_app_is_compared_as_numbers_not_as_text() {
    let root = Root::new();
    let ext = root.dev_one(with(manifest("hello", "1.0.0"), "minimum_app", json!("0.9.0")));
    assert_eq!(ext.state, "ready", "{}", ext.reason);
    let root = Root::new();
    let ext = root.dev_one(with(manifest("hello", "1.0.0"), "minimum_app", json!("0.18.0")));
    assert_eq!(ext.state, "ready", "{}", ext.reason);
}

#[test]
fn version_numbers_order_by_value_of_each_part() {
    assert!(extensions::version_tuple("0.9.0") < extensions::version_tuple("0.18.0"));
    assert!(extensions::version_tuple("1.60.0") < extensions::version_tuple("1.66.1"));
    assert!(extensions::version_tuple("2.0.0") > extensions::version_tuple("1.99.99"));
    assert_eq!(extensions::version_tuple("1.66.1"), vec![1, 66, 1]);
}

#[test]
fn panels_default_to_dock_and_keep_dialog() {
    let root = Root::new();
    let contributes = json!({ "panels": [
        { "id": "main", "title": "Main" },
        { "id": "ask", "title": "Ask", "location": "dialog" },
        { "id": "side", "title": "Side", "location": "sidebar" }
    ] });
    let ext = root.dev_one(with(manifest("hello", "1.0.0"), "contributes", contributes));
    let got: Vec<(String, String)> = ext.panels.iter().map(|p| (p["id"].as_str().unwrap().to_string(), p["location"].as_str().unwrap().to_string())).collect();
    assert_eq!(got, vec![("main".into(), "dock".into()), ("ask".into(), "dialog".into()), ("side".into(), "dock".into())]);
    assert_eq!(ext.panels[1]["title"], "Ask");
}

#[test]
fn contributed_commands_are_listed_with_id_and_title() {
    let root = Root::new();
    let ext = root.dev_one(manifest("hello", "1.0.0"));
    assert_eq!(ext.commands, vec![json!({ "id": "greet", "title": "Say hello" })]);
}

#[test]
fn a_command_keeps_the_panel_it_opens() {
    let root = Root::new();
    let contributes = json!({ "panels": [{ "id": "main", "title": "Main" }], "commands": [{ "id": "show", "title": "Show", "panel": "main" }] });
    let ext = root.dev_one(with(manifest("hello", "1.0.0"), "contributes", contributes));
    assert_eq!(ext.commands, vec![json!({ "id": "show", "title": "Show", "panel": "main" })]);
}

#[test]
fn a_contribution_without_a_title_or_with_a_bad_id_is_left_out() {
    let root = Root::new();
    let contributes = json!({ "commands": [
        { "id": "ok", "title": "Fine" },
        { "id": "untitled" },
        { "id": "Bad Id", "title": "Nope" }
    ] });
    let ext = root.dev_one(with(manifest("hello", "1.0.0"), "contributes", contributes));
    assert_eq!(ext.state, "ready");
    assert_eq!(ext.commands, vec![json!({ "id": "ok", "title": "Fine" })]);
}

#[test]
fn contributing_a_panel_without_a_page_is_refused() {
    let root = Root::new();
    let ext = root.dev_one(without(manifest("hello", "1.0.0"), "entry"));
    assert_eq!(ext.state, "refused");
    assert!(ext.reason.contains("entry.ui"), "{}", ext.reason);
}

#[test]
fn an_entry_page_that_climbs_out_of_the_package_is_refused() {
    for bad in ["../index.html", "/etc/passwd", "a/../../x.html", "a\\b.html"] {
        let root = Root::new();
        let ext = root.dev_one(with(manifest("hello", "1.0.0"), "entry", json!({ "ui": bad })));
        assert_eq!(ext.state, "refused", "{bad}");
        assert_eq!(ext.entry_ui, "");
    }
}

#[test]
fn an_entry_page_that_is_not_in_the_folder_is_refused_by_name() {
    let root = Root::new();
    let ext = root.dev_one(with(manifest("hello", "1.0.0"), "entry", json!({ "ui": "missing.html" })));
    assert_eq!(ext.state, "refused");
    assert!(ext.reason.contains("missing.html"), "{}", ext.reason);
}

#[test]
fn an_entry_page_that_is_not_text_is_refused() {
    let root = Root::new();
    let ext = root.dev_one(with(manifest("hello", "1.0.0"), "entry", json!({ "ui": 5 })));
    assert_eq!(ext.state, "refused");
}

#[test]
fn an_extension_with_no_name_is_shown_under_its_id() {
    let root = Root::new();
    let ext = root.dev_one(without(manifest("hello", "1.0.0"), "name"));
    assert_eq!(ext.name, "hello");
    assert_eq!(ext.public("formext:/")["name"], "hello");
}

#[test]
fn packages_in_enabled_json_load_with_source_catalogue_or_sideload() {
    let root = Root::new();
    let a = root.package("a", &manifest("alpha", "1.0.0"));
    let b = root.package("b", &manifest("beta", "2.0.0"));
    root.enabled(vec![
        json!({ "id": "alpha", "version": "1.0.0", "path": a.display().to_string() }),
        json!({ "id": "beta", "version": "2.0.0", "path": b.display().to_string(), "source": "sideload" }),
    ]);
    let all = root.list();
    let got: Vec<(&str, &str, &str)> = all.iter().map(|e| (e.id.as_str(), e.source.as_str(), e.state.as_str())).collect();
    assert_eq!(got.len(), 2);
    assert!(got.contains(&("alpha", "catalogue", "ready")), "{got:?}");
    assert!(got.contains(&("beta", "sideload", "ready")), "{got:?}");
}

#[test]
fn an_installed_package_whose_manifest_version_differs_from_the_listed_one_is_refused() {
    let root = Root::new();
    let a = root.package("a", &manifest("alpha", "1.0.1"));
    root.enabled(vec![json!({ "id": "alpha", "version": "1.0.0", "path": a.display().to_string() })]);
    let all = root.list();
    assert_eq!(all[0].state, "refused");
    assert!(all[0].reason.contains("1.0.1") && all[0].reason.contains("1.0.0"), "{}", all[0].reason);
}

#[test]
fn a_development_folder_replaces_the_installed_package_of_the_same_id() {
    let root = Root::new();
    let a = root.package("a", &manifest("hello", "1.0.0"));
    let d = root.package("d", &manifest("hello", "1.1.0"));
    root.enabled(vec![json!({ "id": "hello", "version": "1.0.0", "path": a.display().to_string() })]);
    root.dev(&[("hello", &d)]);
    let all = root.list();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].source, "development");
    assert_eq!(all[0].version, "1.1.0");
}

#[test]
fn removing_a_row_from_enabled_json_removes_the_extension_from_the_list() {
    let root = Root::new();
    let a = root.package("a", &manifest("alpha", "1.0.0"));
    root.enabled(vec![json!({ "id": "alpha", "version": "1.0.0", "path": a.display().to_string() })]);
    assert_eq!(root.list().len(), 1);
    root.enabled(vec![]);
    assert!(root.list().is_empty());
}

#[test]
fn nothing_is_listed_when_no_list_files_exist() {
    let root = Root::new();
    assert!(root.list().is_empty());
}

#[test]
fn a_dev_json_of_another_format_is_ignored() {
    let root = Root::new();
    let d = root.package("d", &manifest("hello", "1.0.0"));
    let doc = json!({ "format": "formportal-enabled-extensions", "format_version": 1, "extensions": [{ "id": "hello", "path": d.display().to_string() }] });
    std::fs::write(root.path().join("extensions/formtray/dev.json"), doc.to_string()).unwrap();
    assert!(root.list().is_empty());
}

#[test]
fn extensions_listed_for_another_product_are_not_seen() {
    let root = Root::new();
    let d = root.package("d", &manifest("hello", "1.0.0"));
    root.dev(&[("hello", &d)]);
    assert!(extensions::resolve("formvis", "0.18.0", "FormVis", Some(root.path())).is_empty());
    assert_eq!(root.list().len(), 1);
}

#[test]
fn rows_with_ids_that_are_not_lowercase_slugs_are_skipped() {
    let root = Root::new();
    let d = root.package("d", &manifest("hello", "1.0.0"));
    root.dev(&[("Hello World", &d), ("x", &d), ("../up", &d), ("hello", &d)]);
    let all = root.list();
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].id, "hello");
}

#[test]
fn the_list_is_ordered_by_name_ignoring_case() {
    let root = Root::new();
    let z = root.package("z", &with(manifest("aa-first-id", "1.0.0"), "name", json!("zebra")));
    let m = root.package("m", &with(manifest("mm-id", "1.0.0"), "name", json!("Mango")));
    let a = root.package("a", &with(manifest("zz-last-id", "1.0.0"), "name", json!("apple")));
    root.dev(&[("aa-first-id", &z), ("mm-id", &m), ("zz-last-id", &a)]);
    let names: Vec<String> = root.list().into_iter().map(|e| e.name).collect();
    assert_eq!(names, vec!["apple", "Mango", "zebra"]);
}

#[test]
fn the_listing_gives_a_files_base_of_id_then_version() {
    let root = Root::new();
    let ext = root.dev_one(manifest("hello", "1.2.3"));
    let row = ext.public("formext:/");
    assert_eq!(row["base"], "formext://hello/1.2.3/");
    assert_eq!(ext.public("/api/extensions/files")["base"], "/api/extensions/files/hello/1.2.3/");
    assert_eq!(row["entryUi"], "index.html");
    assert_eq!(row["state"], "ready");
    assert_eq!(row["source"], "development");
    assert_eq!(row["permissions"], json!(["document"]));
}

#[test]
fn only_a_development_extension_shows_its_folder_in_the_listing() {
    let root = Root::new();
    let a = root.package("a", &manifest("alpha", "1.0.0"));
    let d = root.package("d", &manifest("hello", "1.0.0"));
    root.enabled(vec![json!({ "id": "alpha", "version": "1.0.0", "path": a.display().to_string() })]);
    root.dev(&[("hello", &d)]);
    let all = root.list();
    let alpha = all.iter().find(|e| e.id == "alpha").unwrap().public("b");
    let hello = all.iter().find(|e| e.id == "hello").unwrap().public("b");
    assert_eq!(alpha["path"], Value::Null);
    assert_eq!(hello["path"], d.display().to_string());
}

#[test]
fn a_package_file_is_served_from_id_version_path_with_its_type() {
    let root = Root::new();
    let d = root.package("d", &manifest("hello", "1.0.0"));
    std::fs::create_dir_all(d.join("img")).unwrap();
    std::fs::write(d.join("img/logo.PNG"), b"x").unwrap();
    std::fs::write(d.join("app.js"), b"1").unwrap();
    root.dev(&[("hello", &d)]);
    let all = root.list();
    let (path, kind) = extensions::file_for(&all, "hello", "1.0.0", "index.html").unwrap();
    assert_eq!(std::fs::read_to_string(path).unwrap(), "<!doctype html><title>x</title>");
    assert_eq!(kind, "text/html; charset=utf-8");
    assert_eq!(extensions::file_for(&all, "hello", "1.0.0", "app.js").unwrap().1, "text/javascript; charset=utf-8");
    assert_eq!(extensions::file_for(&all, "hello", "1.0.0", "img/logo.PNG").unwrap().1, "image/png");
    assert_eq!(extensions::file_for(&all, "hello", "1.0.0", "manifest.json").unwrap().1, "application/json");
}

#[test]
fn files_are_not_served_for_another_version_or_an_unknown_extension() {
    let root = Root::new();
    let d = root.package("d", &manifest("hello", "1.0.0"));
    root.dev(&[("hello", &d)]);
    let all = root.list();
    assert!(extensions::file_for(&all, "hello", "1.0.1", "index.html").is_none());
    assert!(extensions::file_for(&all, "nobody", "1.0.0", "index.html").is_none());
    assert!(extensions::file_for(&all, "hello", "1.0.0", "nothere.html").is_none());
}

#[test]
fn files_outside_the_package_are_never_served() {
    let root = Root::new();
    let d = root.package("d", &manifest("hello", "1.0.0"));
    std::fs::write(root.path().join("packages/secret.txt"), b"s").unwrap();
    root.dev(&[("hello", &d)]);
    let all = root.list();
    for bad in ["../secret.txt", "x/../../secret.txt", "/etc/hostname.txt", "..\\secret.txt", ""] {
        assert!(extensions::file_for(&all, "hello", "1.0.0", bad).is_none(), "{bad}");
    }
}

#[cfg(unix)]
#[test]
fn a_link_inside_the_package_pointing_out_of_it_is_not_served() {
    let root = Root::new();
    let d = root.package("d", &manifest("hello", "1.0.0"));
    let secret = root.path().join("packages/secret.txt");
    std::fs::write(&secret, b"s").unwrap();
    std::os::unix::fs::symlink(&secret, d.join("leak.txt")).unwrap();
    std::os::unix::fs::symlink(root.path().join("packages"), d.join("up")).unwrap();
    root.dev(&[("hello", &d)]);
    let all = root.list();
    assert!(extensions::file_for(&all, "hello", "1.0.0", "leak.txt").is_none());
    assert!(extensions::file_for(&all, "hello", "1.0.0", "up/secret.txt").is_none());
}

#[test]
fn files_of_types_the_host_does_not_know_are_not_served() {
    let root = Root::new();
    let d = root.package("d", &manifest("hello", "1.0.0"));
    std::fs::write(d.join("tool.exe"), b"x").unwrap();
    std::fs::write(d.join("README"), b"x").unwrap();
    root.dev(&[("hello", &d)]);
    let all = root.list();
    assert!(extensions::file_for(&all, "hello", "1.0.0", "tool.exe").is_none());
    assert!(extensions::file_for(&all, "hello", "1.0.0", "README").is_none());
}

#[test]
fn files_of_a_refused_extension_are_not_served() {
    let root = Root::new();
    let d = root.package("d", &with(manifest("hello", "1.0.0"), "product", json!("formvis")));
    root.dev(&[("hello", &d)]);
    let all = root.list();
    assert_eq!(all[0].state, "refused");
    assert!(extensions::file_for(&all, "hello", &all[0].version, "index.html").is_none());
}

#[test]
fn an_extension_page_is_forbidden_from_reaching_the_network_or_framing() {
    let csp = extensions::csp_for("formext://hello/1.0.0/");
    let parts: Vec<&str> = csp.split("; ").collect();
    assert!(parts.contains(&"connect-src 'none'"), "{csp}");
    assert!(parts.contains(&"default-src 'none'"), "{csp}");
    assert!(parts.contains(&"frame-src 'none'"), "{csp}");
    assert!(parts.contains(&"form-action 'none'"), "{csp}");
    assert!(parts.contains(&"base-uri 'none'"), "{csp}");
}

#[test]
fn an_extension_page_may_load_scripts_only_from_its_own_base() {
    let csp = extensions::csp_for("formext://hello/1.0.0/");
    let script = csp.split("; ").find(|p| p.starts_with("script-src ")).unwrap();
    assert_eq!(script, "script-src formext://hello/1.0.0/ 'wasm-unsafe-eval'");
    assert!(!script.contains("'unsafe-inline'") && !script.contains("'unsafe-eval'"));
    let win = extensions::csp_for("http://formext.localhost/hello/1.0.0/");
    assert!(win.contains("script-src http://formext.localhost/hello/1.0.0/ "), "{win}");
    let dev = extensions::csp_for("/api/extensions/files/hello/1.0.0/");
    assert!(dev.contains("script-src 'self' "), "{dev}");
}

#[test]
fn only_html_responses_carry_the_content_security_policy() {
    let find = |h: &[(&'static str, String)], k: &str| h.iter().find(|(n, _)| *n == k).map(|(_, v)| v.clone());
    let html = extensions::headers_for("text/html; charset=utf-8", "formext://hello/1.0.0/");
    assert_eq!(find(&html, "Content-Security-Policy"), Some(extensions::csp_for("formext://hello/1.0.0/")));
    assert_eq!(find(&html, "X-Content-Type-Options").as_deref(), Some("nosniff"));
    assert_eq!(find(&html, "Cache-Control").as_deref(), Some("no-store"));
    let js = extensions::headers_for("text/javascript; charset=utf-8", "formext://hello/1.0.0/");
    assert_eq!(find(&js, "Content-Security-Policy"), None);
    assert_eq!(find(&js, "X-Content-Type-Options").as_deref(), Some("nosniff"));
}

#[test]
fn the_change_stamp_is_zero_without_list_files_and_set_once_they_exist() {
    let root = Root::new();
    assert_eq!(extensions::stamp("formtray", Some(root.path())), (0.0, 0.0));
    let d = root.package("d", &manifest("hello", "1.0.0"));
    root.dev(&[("hello", &d)]);
    let (enabled, dev) = extensions::stamp("formtray", Some(root.path()));
    assert_eq!(enabled, 0.0);
    assert!(dev > 1_000_000_000.0, "{dev}");
    root.enabled(vec![]);
    assert!(extensions::stamp("formtray", Some(root.path())).0 > 1_000_000_000.0);
}

#[test]
fn formportal_root_from_the_environment_is_where_extensions_are_looked_up() {
    let root = Root::new();
    let d = root.package("d", &manifest("hello", "1.0.0"));
    root.dev(&[("hello", &d)]);
    let before = std::env::var_os("FORMPORTAL_ROOT");
    std::env::set_var("FORMPORTAL_ROOT", root.path());
    let at = extensions::portal_root();
    let all = extensions::resolve("formtray", "0.18.0", "FormTray", None);
    match before {
        Some(v) => std::env::set_var("FORMPORTAL_ROOT", v),
        None => std::env::remove_var("FORMPORTAL_ROOT"),
    }
    assert_eq!(at, root.path());
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].id, "hello");
}

#[test]
fn a_reply_to_something_that_is_not_a_request_id_is_refused() {
    for bad in ["", "../escape", "abc", "12 34"] {
        let err = extensions::answer(bad, &json!({ "ok": true })).unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::InvalidInput, "{bad}");
        assert_eq!(err.to_string(), "not a request id");
    }
}

#[test]
fn a_command_request_survives_a_json_round_trip_and_args_may_be_left_out() {
    let req: extensions::Request = serde_json::from_value(json!({ "id": "1-2", "extension": "hello", "command": "greet" })).unwrap();
    assert_eq!(req.args, Value::Null);
    let full = json!({ "id": "1-2", "extension": "hello", "command": "greet", "args": { "n": 3 } });
    let req: extensions::Request = serde_json::from_value(full.clone()).unwrap();
    assert_eq!(serde_json::to_value(&req).unwrap(), full);
}
