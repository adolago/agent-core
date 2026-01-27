//! Project dialog
//!
//! Manages project selection and creation.

use gpui::*;

/// Project dialog
pub struct ProjectDialog {
    visible: bool,
    projects: Vec<String>,
    selected_project: Option<String>,
}

impl ProjectDialog {
    pub fn new() -> Self {
        Self {
            visible: false,
            projects: Vec::new(),
            selected_project: None,
        }
    }

    pub fn show(&mut self) {
        self.visible = true;
    }

    pub fn hide(&mut self) {
        self.visible = false;
    }
}
