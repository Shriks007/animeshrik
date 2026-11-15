use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use url::Url;

const WORKER_BASE: &str = "https://api.anikage.workers.dev";
const CACHE_TTL_SECS: u64 = 3600; // 60 minutes
const REQUEST_TIMEOUT_SECS: u64 = 30;
const MAX_RETRIES: u32 = 3;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamSource {
    pub label: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkipWindow {
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkipData {
    pub intro: Option<SkipWindow>,
    pub outro: Option<SkipWindow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadEntry {
    pub label: String,
    pub url: String,
    pub quality: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamData {
    pub groups: HashMap<String, Vec<StreamSource>>,
    pub skip: SkipData,
    pub downloads: Vec<DownloadEntry>,
}

struct CacheEntry {
    data: StreamData,
    inserted_at: Instant,
}

lazy_static::lazy_static! {
    static ref STREAM_CACHE: Mutex<HashMap<String, CacheEntry>> = Mutex::new(HashMap::new());
}

fn cache_key(anilist_id: u32, episode: u32) -> String {
    format!("{}:{}", anilist_id, episode)
}

fn is_zoko_url(raw_url: &str) -> bool {
    if let Ok(parsed) = Url::parse(raw_url) {
        parsed.host_str().map(|h| h.eq_ignore_ascii_case("zokoanime.video")).unwrap_or(false)
    } else {
        false
    }
}

fn is_broken_zoko_url(raw_url: &str) -> bool {
    if let Ok(parsed) = Url::parse(raw_url) {
        if parsed.host_str().map(|h| h.eq_ignore_ascii_case("zokoanime.video")).unwrap_or(false) {
            return parsed.path().contains("/stream/ani/");
        }
    }
    false
}

fn is_dead_host(raw_url: &str) -> bool {
    if let Ok(parsed) = Url::parse(raw_url) {
        if let Some(host) = parsed.host_str() {
            return host.eq_ignore_ascii_case("play.vhscdn.to")
                || host.eq_ignore_ascii_case("pahe.nekostream.site");
        }
    }
    false
}

pub fn fix_zoko_url(source: &StreamSource, mal_id: Option<u32>) -> Option<StreamSource> {
    if !is_zoko_url(&source.url) {
        return Some(source.clone());
    }
    if is_broken_zoko_url(&source.url) {
        return None;
    }
    let real_mal_id = match mal_id {
        Some(id) if id > 0 => id,
        _ => return None, // If no real MAL ID, drop Zoko so next server becomes default
    };

    if let Ok(mut parsed) = Url::parse(&source.url) {
        let path = parsed.path().to_string();
        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        // Expected segments: ["stream", "mal", "{malId}", "{episode}", "{sub|dub}"]
        if segments.len() >= 5 && segments[0] == "stream" && segments[1] == "mal" {
            let ep = segments[3];
            let audio = segments[4];
            parsed.set_path(&format!("/stream/mal/{}/{}/{}", real_mal_id, ep, audio));
            return Some(StreamSource {
                label: "Zoko".to_string(),
                url: parsed.to_string(),
            });
        }
    }
    None
}

pub async fn fetch_streams_native(
    anilist_id: u32,
    episode: u32,
    mal_id: Option<u32>,
) -> Result<StreamData, String> {
    let key = cache_key(anilist_id, episode);

    // 1. Check in-memory 60-min cache
    {
        let cache = STREAM_CACHE.lock().map_err(|e| e.to_string())?;
        if let Some(entry) = cache.get(&key) {
            if entry.inserted_at.elapsed() < Duration::from_secs(CACHE_TTL_SECS) {
                return Ok(entry.data.clone());
            }
        }
    }

    // 2. Network scrape with up to 3 retries
    let url = format!("{}/{}/{}", WORKER_BASE, anilist_id, episode);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;

    let mut last_error = String::new();
    let mut raw_json: Option<serde_json::Value> = None;

    for attempt in 1..=MAX_RETRIES {
        match client.get(&url).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    match resp.json::<serde_json::Value>().await {
                        Ok(json) => {
                            raw_json = Some(json);
                            break;
                        }
                        Err(e) => {
                            last_error = format!("JSON decode error: {}", e);
                        }
                    }
                } else {
                    last_error = format!("HTTP error: {}", resp.status());
                }
            }
            Err(e) => {
                last_error = format!("Attempt {} failed: {}", attempt, e);
            }
        }
        if attempt < MAX_RETRIES {
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    }

    let json = raw_json.ok_or_else(|| {
        format!(
            "Failed to fetch streams after {} attempts: {}",
            MAX_RETRIES, last_error
        )
    })?;

    // 3. Parse and normalize
    let mut groups: HashMap<String, Vec<StreamSource>> = HashMap::new();
    let categories = [
        "h-sub", "s-sub", "dub", "e-sub", "e-dub", "v-sub", "v-dub",
    ];

    if let Some(servers_obj) = json.get("servers").and_then(|s| s.as_object()) {
        for cat in categories.iter() {
            let mut list = Vec::new();
            if let Some(cat_val) = servers_obj.get(*cat) {
                if let Some(obj) = cat_val.as_object() {
                    for (k, v) in obj {
                        if let Some(u) = v.as_str() {
                            if !is_dead_host(u) {
                                let label = if is_zoko_url(u) {
                                    "Zoko".to_string()
                                } else {
                                    k.clone()
                                };
                                let src = StreamSource {
                                    label,
                                    url: u.to_string(),
                                };
                                if let Some(fixed) = fix_zoko_url(&src, mal_id) {
                                    list.push(fixed);
                                }
                            }
                        }
                    }
                }
            }
            groups.insert(cat.to_string(), list);
        }
    }

    // Parse skip times
    let mut skip_intro = None;
    let mut skip_outro = None;
    if let Some(skip_obj) = json.get("skip") {
        if let Some(intro_str) = skip_obj.get("intro").and_then(|v| v.as_str()) {
            let parts: Vec<f64> = intro_str
                .split(',')
                .filter_map(|s| s.trim().parse::<f64>().ok())
                .collect();
            if parts.len() == 2 && parts[1] > parts[0] {
                skip_intro = Some(SkipWindow {
                    start: parts[0],
                    end: parts[1],
                });
            }
        }
        if let Some(outro_str) = skip_obj.get("outro").and_then(|v| v.as_str()) {
            let parts: Vec<f64> = outro_str
                .split(',')
                .filter_map(|s| s.trim().parse::<f64>().ok())
                .collect();
            if parts.len() == 2 && parts[1] > parts[0] {
                skip_outro = Some(SkipWindow {
                    start: parts[0],
                    end: parts[1],
                });
            }
        }
    }

    // Parse downloads
    let mut downloads = Vec::new();
    if let Some(dl_arr) = json.get("downloads").and_then(|d| d.as_array()) {
        for item in dl_arr {
            if let Some(obj) = item.as_object() {
                let url = obj.get("url").and_then(|u| u.as_str()).unwrap_or("");
                if !url.is_empty() && !is_dead_host(url) {
                    let label = obj
                        .get("label")
                        .and_then(|l| l.as_str())
                        .unwrap_or("Download")
                        .to_string();
                    let quality = obj
                        .get("quality")
                        .and_then(|q| q.as_str())
                        .map(|s| s.to_string());
                    downloads.push(DownloadEntry {
                        label,
                        url: url.to_string(),
                        quality,
                    });
                }
            }
        }
    }

    let result = StreamData {
        groups,
        skip: SkipData {
            intro: skip_intro,
            outro: skip_outro,
        },
        downloads,
    };

    // Store in cache
    if let Ok(mut cache) = STREAM_CACHE.lock() {
        cache.insert(
            key,
            CacheEntry {
                data: result.clone(),
                inserted_at: Instant::now(),
            },
        );
    }

    Ok(result)
}
