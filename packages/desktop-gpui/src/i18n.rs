use gpui::Global;
use serde_json::Value;
use std::collections::HashMap;
use std::env;

#[derive(Clone, Debug)]
pub struct I18n {
    locale: String,
    messages: HashMap<String, String>,
}

impl I18n {
    pub fn locale(&self) -> &str {
        &self.locale
    }

    pub fn t(&self, key: &str) -> String {
        self.messages
            .get(key)
            .cloned()
            .unwrap_or_else(|| key.to_string())
    }

    pub fn format(&self, key: &str, params: &[(&str, &str)]) -> String {
        let mut value = self.t(key);
        for (param, replacement) in params {
            value = value.replace(&format!("{{{param}}}"), replacement);
        }
        value
    }
}

impl Global for I18n {}

fn detect_locale() -> String {
    let candidates = ["LC_ALL", "LC_MESSAGES", "LANG"];
    for key in candidates {
        if let Ok(value) = env::var(key) {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                continue;
            }
            let normalized = trimmed
                .split('.')
                .next()
                .unwrap_or(trimmed)
                .replace('-', "_")
                .to_lowercase();
            if !normalized.is_empty() {
                return normalized;
            }
        }
    }
    "en".to_string()
}

fn load_messages(locale: &str) -> HashMap<String, String> {
    let normalized = locale.to_lowercase();
    let raw = if normalized.starts_with("en") {
        include_str!("../i18n/en.json")
    } else {
        include_str!("../i18n/en.json")
    };

    match serde_json::from_str::<Value>(raw) {
        Ok(Value::Object(map)) => map
            .into_iter()
            .filter_map(|(k, v)| v.as_str().map(|s| (k, s.to_string())))
            .collect(),
        _ => HashMap::new(),
    }
}

pub fn init(cx: &mut gpui::App) {
    let locale = detect_locale();
    let messages = load_messages(&locale);
    cx.set_global(I18n { locale, messages });
}
