//! Permissions dialog
//!
//! Handles tool permission requests.

use gpui::*;

/// Permissions dialog
pub struct PermissionsDialog {
    visible: bool,
    pending_permissions: Vec<PermissionRequest>,
}

/// A permission request from the agent
pub struct PermissionRequest {
    pub tool: String,
    pub description: String,
}

impl PermissionsDialog {
    pub fn new() -> Self {
        Self {
            visible: false,
            pending_permissions: Vec::new(),
        }
    }

    pub fn show(&mut self) {
        self.visible = true;
    }

    pub fn hide(&mut self) {
        self.visible = false;
    }

    pub fn add_request(&mut self, request: PermissionRequest) {
        self.pending_permissions.push(request);
        self.visible = true;
    }
}
