use serde::Deserialize;
use std::env;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone)]
pub struct UpdateInfo {
    pub version: String,
    pub title: Option<String>,
    pub notes_url: Option<String>,
    pub download_url: Option<String>,
    pub published_at: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpdateStatus {
    Idle,
    Checking,
    Available,
    UpToDate,
    Error,
}

#[derive(Debug, Clone)]
pub struct UpdateCheck {
    pub status: UpdateStatus,
    pub info: Option<UpdateInfo>,
    pub error: Option<String>,
    pub checked_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct UpdateFeed {
    version: String,
    title: Option<String>,
    notes_url: Option<String>,
    download_url: Option<String>,
    published_at: Option<String>,
}

pub const DEFAULT_FEED_URL: &str =
    "https://raw.githubusercontent.com/adolago/agent-core/dev/packages/desktop-gpui/appcast.json";

pub fn current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

pub fn default_feed_url() -> String {
    if let Ok(url) = env::var("AGENT_CORE_DESKTOP_UPDATE_FEED") {
        if !url.trim().is_empty() {
            return url;
        }
    }
    if let Ok(url) = env::var("AGENT_CORE_UPDATE_FEED") {
        if !url.trim().is_empty() {
            return url;
        }
    }
    if let Ok(url) = env::var("AGENT_CORE_APPCAST_URL") {
        if !url.trim().is_empty() {
            return url;
        }
    }
    DEFAULT_FEED_URL.to_string()
}

pub async fn check(feed_url: &str) -> UpdateCheck {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let response = match reqwest::get(feed_url).await {
        Ok(res) => res,
        Err(err) => {
            return UpdateCheck {
                status: UpdateStatus::Error,
                info: None,
                error: Some(err.to_string()),
                checked_at: Some(now),
            };
        }
    };

    if !response.status().is_success() {
        return UpdateCheck {
            status: UpdateStatus::Error,
            info: None,
            error: Some(format!("Feed returned {}", response.status())),
            checked_at: Some(now),
        };
    }

    let feed = match response.json::<UpdateFeed>().await {
        Ok(feed) => feed,
        Err(err) => {
            return UpdateCheck {
                status: UpdateStatus::Error,
                info: None,
                error: Some(err.to_string()),
                checked_at: Some(now),
            };
        }
    };

    let info = UpdateInfo {
        version: feed.version.clone(),
        title: feed.title,
        notes_url: feed.notes_url,
        download_url: feed.download_url,
        published_at: feed.published_at,
    };

    let status = if is_newer(&feed.version, current_version()) {
        UpdateStatus::Available
    } else {
        UpdateStatus::UpToDate
    };

    UpdateCheck {
        status,
        info: Some(info),
        error: None,
        checked_at: Some(now),
    }
}

fn parse_version(value: &str) -> Vec<u64> {
    value
        .split(|c| c == '.' || c == '-' || c == '+')
        .filter_map(|part| part.parse::<u64>().ok())
        .collect()
}

fn is_newer(latest: &str, current: &str) -> bool {
    let latest_parts = parse_version(latest);
    let current_parts = parse_version(current);
    let max_len = latest_parts.len().max(current_parts.len());

    for idx in 0..max_len {
        let latest_val = *latest_parts.get(idx).unwrap_or(&0);
        let current_val = *current_parts.get(idx).unwrap_or(&0);
        if latest_val > current_val {
            return true;
        }
        if latest_val < current_val {
            return false;
        }
    }

    false
}
