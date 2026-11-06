use serde::{Deserialize, Serialize};

const DATA: &str = include_str!("../data/apps.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub alt_of: String,
    pub category: String,
    pub hue: String,
    #[serde(default)]
    pub icon: String,
    pub identifiers: Vec<String>,
    pub names: Vec<String>,
    #[serde(default)]
    pub opens: String,
}

pub fn opens_unix(s: &str) -> Option<u64> {
    let b = s.as_bytes();
    if !s.is_ascii() || b.len() != 20 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || b[13] != b':' || b[16] != b':' || b[19] != b'Z' {
        return None;
    }
    let num = |from: usize, to: usize| -> Option<i64> {
        let part = &s[from..to];
        if part.bytes().all(|c| c.is_ascii_digit()) {
            part.parse::<i64>().ok()
        } else {
            None
        }
    };
    let y = num(0, 4)?;
    let m = num(5, 7)?;
    let d = num(8, 10)?;
    let hh = num(11, 13)?;
    let mm = num(14, 16)?;
    let ss = num(17, 19)?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) || hh > 23 || mm > 59 || ss > 59 {
        return None;
    }
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    let secs = days * 86400 + hh * 3600 + mm * 60 + ss;
    u64::try_from(secs).ok()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Registry {
    #[serde(default)]
    pub excluded: Vec<String>,
    pub categories: Vec<Category>,
    pub apps: Vec<AppEntry>,
}

impl Registry {
    pub fn load() -> Registry {
        serde_json::from_str(DATA).expect("core/data/apps.json is valid")
    }

    pub fn get(&self, id: &str) -> Option<&AppEntry> {
        let wanted = id.to_ascii_lowercase();
        self.apps.iter().find(|a| {
            a.id == wanted || a.name.eq_ignore_ascii_case(&wanted) || a.names.iter().any(|n| n.eq_ignore_ascii_case(&wanted))
        })
    }
}

impl AppEntry {
    pub fn released_at(&self, now_unix: u64) -> bool {
        opens_unix(&self.opens).is_some_and(|t| t <= now_unix)
    }

    pub fn matches_name(&self, candidate: &str) -> bool {
        self.names.iter().any(|n| n.eq_ignore_ascii_case(candidate)) || self.name.eq_ignore_ascii_case(candidate)
    }
}
