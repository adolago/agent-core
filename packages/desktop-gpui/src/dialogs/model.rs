//! Model picker dialog
//!
//! Allows selecting the AI model to use.

use gpui::*;

/// Model picker dialog
pub struct ModelDialog {
    visible: bool,
    selected_model: Option<String>,
}

impl ModelDialog {
    pub fn new() -> Self {
        Self {
            visible: false,
            selected_model: None,
        }
    }

    pub fn show(&mut self) {
        self.visible = true;
    }

    pub fn hide(&mut self) {
        self.visible = false;
    }
}
