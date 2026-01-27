//! File picker dialog
//!
//! Allows selecting files and directories.

use gpui::*;

/// File picker dialog
pub struct FileDialog {
    visible: bool,
    mode: FileDialogMode,
    selected_path: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum FileDialogMode {
    #[default]
    OpenFile,
    OpenDirectory,
    SaveFile,
}

impl FileDialog {
    pub fn new() -> Self {
        Self {
            visible: false,
            mode: FileDialogMode::default(),
            selected_path: None,
        }
    }

    pub fn show(&mut self) {
        self.visible = true;
    }

    pub fn hide(&mut self) {
        self.visible = false;
    }
}
