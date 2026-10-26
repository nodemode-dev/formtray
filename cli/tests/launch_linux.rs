#![cfg(all(unix, not(target_os = "macos")))]

use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

const BIN: &str = env!("CARGO_BIN_EXE_formtray-cli");

static ONE_AT_A_TIME: Mutex<()> = Mutex::new(());

struct Sandbox {
    root: PathBuf,
    children: Vec<Child>,
    _turn: MutexGuard<'static, ()>,
}

impl Sandbox {
    fn new(tag: &str) -> Sandbox {
        let turn = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
        static N: AtomicUsize = AtomicUsize::new(0);
        let root = std::env::temp_dir().join(format!("formtray-launch-{}-{tag}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = std::fs::remove_dir_all(&root);
        for dir in ["home/.local/bin", "home/.config", "fakes", "portal"] {
            std::fs::create_dir_all(root.join(dir)).unwrap();
        }
        Sandbox { root, children: Vec::new(), _turn: turn }
    }

    fn state(&self, id: &str) -> serde_json::Value {
        let (code, out) = self.cli(&["list", "--json"]);
        assert_eq!(code, 0, "{out}");
        let apps: serde_json::Value = serde_json::from_str(&out).unwrap();
        apps.as_array().unwrap().iter().find(|a| a["id"] == id).cloned().unwrap()
    }

    fn only_ours_running(&self, id: &str, ours: u64) {
        let processes = self.state(id)["processes"].as_u64().unwrap();
        assert_eq!(processes, ours, "another {id} is running on this computer; close it before running these tests, they would act on it");
    }

    fn path(&self, rel: &str) -> PathBuf {
        self.root.join(rel)
    }

    fn script(&self, rel: &str, body: &str) -> PathBuf {
        let path = self.path(rel);
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    fn cli(&self, args: &[&str]) -> (i32, String) {
        let path = format!("{}:/usr/bin:/bin", self.path("fakes").display());
        let out = Command::new(BIN)
            .env_clear()
            .env("HOME", self.path("home"))
            .env("XDG_CONFIG_HOME", self.path("home/.config"))
            .env("XDG_DATA_HOME", self.path("home/.local/share"))
            .env("FORMPORTAL_ROOT", self.path("portal"))
            .env("PATH", path)
            .env("CALLS", self.path("calls"))
            .args(args)
            .stdin(Stdio::null())
            .output()
            .unwrap();
        (out.status.code().unwrap_or(-1), String::from_utf8_lossy(&out.stdout).into_owned() + &String::from_utf8_lossy(&out.stderr))
    }

    fn calls(&self) -> String {
        std::fs::read_to_string(self.path("calls")).unwrap_or_default()
    }

    fn wait_for(&self, rel: &str) -> String {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if let Ok(text) = std::fs::read_to_string(self.path(rel)) {
                if !text.is_empty() {
                    return text;
                }
            }
            assert!(Instant::now() < deadline, "{rel} never appeared");
            std::thread::sleep(Duration::from_millis(25));
        }
    }

    fn running_copy_of_sleep(&mut self, rel: &str) -> u32 {
        let target = self.path(rel);
        let sleep = ["/usr/bin/sleep", "/bin/sleep"].into_iter().map(Path::new).find(|p| p.is_file()).expect("a sleep binary");
        std::fs::copy(sleep, &target).unwrap();
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755)).unwrap();
        let child = Command::new(&target).arg("60").spawn().unwrap();
        let pid = child.id();
        self.children.push(child);
        pid
    }

    fn alive(&mut self) -> bool {
        self.children.iter_mut().all(|c| c.try_wait().ok().flatten().is_none())
    }
}

impl Drop for Sandbox {
    fn drop(&mut self) {
        for c in &mut self.children {
            let _ = c.kill();
            let _ = c.wait();
        }
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

fn usage_count(s: &Sandbox, id: &str) -> u64 {
    let text = std::fs::read_to_string(s.path("home/.config/formtray/usage.json")).unwrap_or_default();
    serde_json::from_str::<serde_json::Value>(&text).ok().and_then(|v| v["apps"][id]["count"].as_u64()).unwrap_or(0)
}

#[test]
fn opening_an_app_that_is_not_running_starts_its_program_from_its_folder() {
    let s = Sandbox::new("start");
    s.only_ours_running("formcut", 0);
    s.script("home/.local/bin/formcut", &format!("pwd > {}", s.path("started").display()));
    s.script("fakes/xdotool", "echo \"$@\" >> \"$CALLS\"; exit 0");
    let (code, out) = s.cli(&["open", "FormCut"]);
    assert_eq!(code, 0, "{out}");
    assert_eq!(s.wait_for("started").trim(), s.path("home/.local/bin").display().to_string());
    assert_eq!(s.calls(), "", "xdotool was asked to focus an app that was not running");
    assert_eq!(usage_count(&s, "formcut"), 1);
}

#[test]
fn opening_a_running_app_brings_its_window_forward_without_starting_another() {
    let mut s = Sandbox::new("focus");
    s.only_ours_running("formvfx", 0);
    let pid = s.running_copy_of_sleep("home/.local/bin/formvfx");
    s.only_ours_running("formvfx", 1);
    s.script("fakes/xdotool", "echo \"$@\" >> \"$CALLS\"; exit 0");
    let (code, out) = s.cli(&["open", "formvfx"]);
    assert_eq!(code, 0, "{out}");
    assert_eq!(s.calls().trim(), format!("search --onlyvisible --pid {pid} windowactivate"));
    assert!(s.alive());
}

#[test]
fn opening_an_app_that_is_not_installed_says_so() {
    let s = Sandbox::new("missing");
    let (code, out) = s.cli(&["open", "formpdf"]);
    assert_eq!(code, 1);
    assert!(out.contains("is not installed on this computer"), "{out}");
    assert_eq!(usage_count(&s, "formpdf"), 0);
}

#[test]
fn an_unknown_app_is_refused() {
    let s = Sandbox::new("unknown");
    let (code, _) = s.cli(&["open", "notepad"]);
    assert_ne!(code, 0);
}

#[test]
fn a_desktop_entry_resolves_to_its_program() {
    let s = Sandbox::new("desktop");
    std::fs::create_dir_all(s.path("home/.local/share/applications")).unwrap();
    std::fs::create_dir_all(s.path("progs")).unwrap();
    let program = s.path("progs/formlit");
    std::fs::write(s.path("home/.local/share/applications/lit.desktop"), format!("[Desktop Entry]\nName=Lit\nExec={} %F\n", program.display())).unwrap();
    s.only_ours_running("formlit", 0);
    assert_eq!(s.state("formlit")["installed"], false, "an entry whose program is missing counts as installed");
    s.script("progs/formlit", &format!("pwd > {}", s.path("started").display()));
    let found = s.state("formlit");
    assert_eq!(found["installed"], true);
    assert_eq!(found["path"], program.display().to_string());
    let (code, out) = s.cli(&["open", "formlit"]);
    assert_eq!(code, 0, "{out}");
    assert_eq!(s.wait_for("started").trim(), s.path("progs").display().to_string());
}

#[test]
fn quitting_a_running_app_ends_its_process() {
    let mut s = Sandbox::new("quit");
    s.only_ours_running("formwav", 0);
    s.running_copy_of_sleep("home/.local/bin/formwav");
    s.only_ours_running("formwav", 1);
    let (code, out) = s.cli(&["quit", "formwav"]);
    assert_eq!(code, 0, "{out}");
    let deadline = Instant::now() + Duration::from_secs(10);
    while s.alive() {
        assert!(Instant::now() < deadline, "formwav was still running");
        std::thread::sleep(Duration::from_millis(25));
    }
    let (code, out) = s.cli(&["quit", "formwav"]);
    assert_eq!(code, 1);
    assert!(out.contains("is not running"), "{out}");
}
