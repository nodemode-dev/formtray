use std::collections::{BTreeMap, HashMap};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::portal::Record;

pub const FILES_FORMAT: &str = "formportal-files";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Unrecorded,
    Matches,
    Changed,
    Missing,
    Unreadable,
}

#[derive(Debug, Default)]
pub struct Cache {
    seen: HashMap<PathBuf, (u64, Option<SystemTime>, String)>,
    pub hashed: usize,
}

#[derive(Deserialize)]
struct FilesRecord {
    format: String,
    product: String,
    version: String,
    #[serde(default)]
    files: BTreeMap<String, String>,
}

fn digest(path: &Path) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 16];
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

impl Cache {
    fn digest(&mut self, path: &Path, meta: &std::fs::Metadata) -> std::io::Result<String> {
        let stamp = (meta.len(), meta.modified().ok());
        if let Some((len, modified, hash)) = self.seen.get(path) {
            if (*len, *modified) == stamp {
                return Ok(hash.clone());
            }
        }
        let hash = digest(path)?;
        self.hashed += 1;
        self.seen.insert(path.to_path_buf(), (stamp.0, stamp.1, hash.clone()));
        Ok(hash)
    }
}

pub fn check(record: Option<&Record>, program: &Path, cache: &mut Cache) -> Verdict {
    let Some(record) = record else { return Verdict::Unrecorded };
    let Some(files) = &record.files else { return Verdict::Unrecorded };
    let Ok(relative) = program.strip_prefix(&record.folder) else { return Verdict::Unrecorded };
    let text = match std::fs::read_to_string(files) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Verdict::Unrecorded,
        Err(_) => return Verdict::Unreadable,
    };
    let Ok(found) = serde_json::from_str::<FilesRecord>(&text) else { return Verdict::Unreadable };
    if found.format != FILES_FORMAT || found.product != record.product || found.version != record.version {
        return Verdict::Unreadable;
    }
    let Ok(meta) = std::fs::symlink_metadata(program) else { return Verdict::Missing };
    let key = relative.to_string_lossy().replace('\\', "/");
    let Some(expected) = found.files.get(&key) else { return Verdict::Changed };
    if meta.file_type().is_symlink() {
        let target = std::fs::read_link(program).map(|t| format!("link:{}", t.to_string_lossy())).unwrap_or_default();
        return if &target == expected { Verdict::Matches } else { Verdict::Changed };
    }
    match cache.digest(program, &meta) {
        Ok(actual) if actual.eq_ignore_ascii_case(expected) => Verdict::Matches,
        Ok(_) => Verdict::Changed,
        Err(_) => Verdict::Missing,
    }
}

pub fn refusal(verdict: Verdict, name: &str) -> Option<String> {
    let why = match verdict {
        Verdict::Unrecorded | Verdict::Matches => return None,
        Verdict::Changed => "its program file is not the one FormPortal installed",
        Verdict::Missing => "its program file is missing from the folder FormPortal installed it in",
        Verdict::Unreadable => "FormPortal's list of its files could not be read, so its program could not be checked",
    };
    Some(format!("{name} was not opened: {why}. Install {name} again with FormPortal."))
}
