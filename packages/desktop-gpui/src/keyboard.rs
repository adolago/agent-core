//! Keyboard bindings for Agent Core Desktop
//!
//! Provides configurable keyboard shortcuts for common actions.

use gpui::*;

/// Global keyboard actions
#[derive(Debug, Clone, PartialEq)]
pub enum GlobalAction {
    // Navigation
    NextView,
    PreviousView,
    GoToSessions,
    GoToChat,
    GoToSettings,

    // Session management
    NewSession,
    CloseSession,

    // Persona switching
    SwitchToZee,
    SwitchToStanley,
    SwitchToJohny,

    // Theme
    ToggleTheme,

    // Dialog
    OpenCommandPalette,
    OpenModelPicker,
    OpenProviderDialog,
    OpenSettings,

    // General
    Cancel,
    Confirm,
}

// Register action types
actions!(
    agent_core,
    [
        NextView,
        PreviousView,
        GoToSessions,
        GoToChat,
        GoToSettings,
        NewSession,
        CloseSession,
        SwitchToZee,
        SwitchToStanley,
        SwitchToJohny,
        ToggleTheme,
        OpenCommandPalette,
        OpenModelPicker,
        OpenProviderDialog,
        OpenSettings,
        Cancel,
        Confirm,
    ]
);

/// Initialize keyboard bindings
pub fn init(cx: &mut App) {
    // Register the keymap
    cx.bind_keys([
        // Navigation
        KeyBinding::new("ctrl-tab", NextView, None),
        KeyBinding::new("ctrl-shift-tab", PreviousView, None),
        KeyBinding::new("ctrl-1", GoToSessions, None),
        KeyBinding::new("ctrl-2", GoToChat, None),
        KeyBinding::new("ctrl-,", GoToSettings, None),

        // Session management
        KeyBinding::new("ctrl-n", NewSession, None),
        KeyBinding::new("ctrl-w", CloseSession, None),

        // Persona switching
        KeyBinding::new("ctrl-shift-1", SwitchToZee, None),
        KeyBinding::new("ctrl-shift-2", SwitchToStanley, None),
        KeyBinding::new("ctrl-shift-3", SwitchToJohny, None),

        // Theme
        KeyBinding::new("ctrl-shift-t", ToggleTheme, None),

        // Dialogs
        KeyBinding::new("ctrl-p", OpenCommandPalette, None),
        KeyBinding::new("ctrl-m", OpenModelPicker, None),
        KeyBinding::new("ctrl-shift-p", OpenProviderDialog, None),
        KeyBinding::new("ctrl-;", OpenSettings, None),

        // General
        KeyBinding::new("escape", Cancel, None),
        KeyBinding::new("enter", Confirm, None),
    ]);

    tracing::debug!("Keyboard bindings initialized");
}
