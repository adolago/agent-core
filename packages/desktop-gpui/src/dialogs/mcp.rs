//! MCP configuration dialog
//!
//! Manages Model Context Protocol servers.

use gpui::*;

/// MCP configuration dialog
pub struct McpDialog {
    visible: bool,
}

impl McpDialog {
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
