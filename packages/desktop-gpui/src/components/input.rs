//! Input component for text entry
//!
//! Provides a text input with placeholder support.

use gpui::*;

/// Text input component
pub struct Input {
    pub value: String,
    pub placeholder: String,
    pub focused: bool,
}

impl Input {
    pub fn new(placeholder: &str) -> Self {
        Self {
            value: String::new(),
            placeholder: placeholder.to_string(),
            focused: false,
        }
    }
}
