use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use formtray_core::portal::{read_at, Record};
use formtray_core::verify::{check, refusal, Cache, Verdict};
use sha2::{Digest, Sha256};

struct Portal {
    root: PathBuf,
}

impl Portal {
    fn new(tag: &str, program: &[u8], with_files: bool) -> Portal {
        static N: AtomicUsize = AtomicUsize::new(0);
        let root = std::env::temp_dir().join(format!("formtray-record-{}-{tag}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = std::fs::remove_dir_all(&root);
        let folder = root.join("apps/formcut/stable/1.2.3");
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("formcut"), program).unwrap();
        let hash: String = Sha256::digest(program).iter().map(|b| format!("{b:02x}")).collect();
        let files = root.join("apps/formcut/stable/1.2.3.files.json");
        let record = serde_json::json!({"format": "formportal-files", "format_version": 1, "product": "formcut", "channel": "stable", "version": "1.2.3", "files": {"formcut": hash}});
        std::fs::write(&files, record.to_string()).unwrap();
        let mut current = serde_json::json!({"version": "1.2.3", "path": folder, "sha256": "0", "installed_at": 1});
        if with_files {
            current["files"] = serde_json::json!(files);
        }
        let installed = serde_json::json!({"installs": [{"product": "formcut", "channel": "stable", "current": current}]});
        std::fs::write(root.join("installed.json"), installed.to_string()).unwrap();
        Portal { root }
    }

    fn program(&self) -> PathBuf {
        self.root.join("apps/formcut/stable/1.2.3/formcut")
    }

    fn record(&self) -> Option<Record> {
        read_at(&self.root).records.get("formcut").cloned()
    }

    fn verdict(&self, program: &Path, cache: &mut Cache) -> Verdict {
        check(self.record().as_ref(), program, cache)
    }
}

impl Drop for Portal {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

#[test]
fn a_program_that_matches_formportals_record_is_opened_and_hashed_once() {
    let p = Portal::new("match", b"the program", true);
    let mut cache = Cache::default();
    assert_eq!(p.verdict(&p.program(), &mut cache), Verdict::Matches);
    assert_eq!(p.verdict(&p.program(), &mut cache), Verdict::Matches);
    assert_eq!(cache.hashed, 1);
    assert_eq!(refusal(Verdict::Matches, "FormCut"), None);
}

#[test]
fn a_changed_program_is_refused_in_plain_words() {
    let p = Portal::new("changed", b"the program", true);
    let mut cache = Cache::default();
    assert_eq!(p.verdict(&p.program(), &mut cache), Verdict::Matches);
    std::fs::write(p.program(), b"another program").unwrap();
    assert_eq!(p.verdict(&p.program(), &mut cache), Verdict::Changed);
    std::fs::write(p.program(), b"THE PROGRAM").unwrap();
    assert_eq!(p.verdict(&p.program(), &mut Cache::default()), Verdict::Changed);
    let extra = p.program().with_file_name("formcut-other");
    std::fs::write(&extra, b"x").unwrap();
    assert_eq!(p.verdict(&extra, &mut cache), Verdict::Changed);
    assert_eq!(
        refusal(Verdict::Changed, "FormCut").unwrap(),
        "FormCut was not opened: its program file is not the one FormPortal installed. Install FormCut again with FormPortal."
    );
}

#[test]
fn without_a_record_the_program_opens_as_before() {
    let p = Portal::new("unrecorded", b"the program", false);
    let mut cache = Cache::default();
    assert_eq!(p.verdict(&p.program(), &mut cache), Verdict::Unrecorded);
    assert_eq!(check(None, &p.program(), &mut cache), Verdict::Unrecorded);
    let q = Portal::new("outside", b"the program", true);
    assert_eq!(q.verdict(Path::new("/usr/bin/formcut"), &mut cache), Verdict::Unrecorded);
    std::fs::remove_file(q.root.join("apps/formcut/stable/1.2.3.files.json")).unwrap();
    assert_eq!(q.verdict(&q.program(), &mut cache), Verdict::Unrecorded);
    assert_eq!(cache.hashed, 0);
}

#[test]
fn a_missing_program_or_an_unreadable_record_is_refused() {
    let p = Portal::new("missing", b"the program", true);
    std::fs::remove_file(p.program()).unwrap();
    assert_eq!(p.verdict(&p.program(), &mut Cache::default()), Verdict::Missing);
    assert!(refusal(Verdict::Missing, "FormCut").unwrap().contains("missing from the folder FormPortal installed it in"));
    let q = Portal::new("unreadable", b"the program", true);
    std::fs::write(q.root.join("apps/formcut/stable/1.2.3.files.json"), "{not json").unwrap();
    assert_eq!(q.verdict(&q.program(), &mut Cache::default()), Verdict::Unreadable);
}
