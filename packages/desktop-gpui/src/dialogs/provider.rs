//! Provider connection dialog
//!
//! Allows configuring AI providers and API keys.

use gpui::*;

/// Provider dialog for managing AI providers
pub struct ProviderDialog {
    visible: bool,
}

impl ProviderDialog {
    pub fn new() -> Self {
        Self { visible: false }
    }

    pub fn show(&mut self) {
        self.visible = true;
    }

    pub fn hide(&mut self) {
        self.visible = false;
    }
}
