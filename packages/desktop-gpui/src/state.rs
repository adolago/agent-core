//! Centralized application state management
//!
//! This module provides the single source of truth for all application state,
//! including sessions, messages, providers, models, and UI state.

use std::collections::HashMap;
use gpui::*;
use crate::api::types::{
    Message, Model, Part, PermissionRequest, Provider, QuestionRequest, Session, SessionStatus,
};
use crate::update::{default_feed_url, UpdateCheck, UpdateInfo, UpdateStatus};

#[cfg(feature = "trading")]
use stanley_core::{Portfolio, RiskMetrics, paper_trade::PaperTradingStatus};

// ============================================================================
// Application State
// ============================================================================

/// Centralized application state
#[derive(Debug, Clone)]
pub struct AppState {
    // Connection state
    pub daemon_url: String,
    pub connected: bool,
    pub connecting: bool,

    // Session state
    pub sessions: Vec<Session>,
    pub active_session_id: Option<String>,
    pub sessions_loading: bool,
    pub session_status: HashMap<String, SessionStatus>,

    // Messages per session
    pub messages: HashMap<String, Vec<Message>>,
    pub messages_loading: HashMap<String, bool>,
    pub streaming_message: Option<StreamingMessage>,

    // Message parts for real-time updates
    pub parts: HashMap<String, Vec<Part>>,

    // Permission and Question prompts (keyed by session ID)
    pub permissions: HashMap<String, Vec<PermissionRequest>>,
    pub questions: HashMap<String, Vec<QuestionRequest>>,

    // Providers & Models
    pub providers: Vec<Provider>,
    pub models: Vec<Model>,
    pub selected_provider_id: Option<String>,
    pub selected_model_id: Option<String>,

    // UI State
    pub active_view: ActiveView,
    pub active_persona: Persona,
    pub sidebar_collapsed: bool,
    pub current_theme_id: String,

    // Update state
    pub update_feed_url: String,
    pub update_status: UpdateStatus,
    pub update_info: Option<UpdateInfo>,
    pub update_error: Option<String>,
    pub update_last_checked: Option<i64>,

    // Dialog state
    pub dialog_stack: Vec<DialogType>,

    // Input state
    pub prompt_text: String,
    pub prompt_files: Vec<FileAttachment>,
    pub prompt_history: Vec<String>,
    pub prompt_history_index: Option<usize>,

    // Search state
    pub session_search_query: String,
    pub command_search_query: String,

    // Trading state (Stanley persona, behind feature flag)
    #[cfg(feature = "trading")]
    pub portfolio: Option<Portfolio>,
    #[cfg(feature = "trading")]
    pub risk_metrics: Option<RiskMetrics>,
    #[cfg(feature = "trading")]
    pub paper_trading: Option<PaperTradingStatus>,
    #[cfg(feature = "trading")]
    pub watchlist: Vec<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            daemon_url: "http://127.0.0.1:3210".to_string(),
            connected: false,
            connecting: false,

            sessions: Vec::new(),
            active_session_id: None,
            sessions_loading: true,
            session_status: HashMap::new(),

            messages: HashMap::new(),
            messages_loading: HashMap::new(),
            streaming_message: None,

            parts: HashMap::new(),

            permissions: HashMap::new(),
            questions: HashMap::new(),

            providers: Vec::new(),
            models: Vec::new(),
            selected_provider_id: None,
            selected_model_id: None,

            active_view: ActiveView::Sessions,
            active_persona: Persona::Zee,
            sidebar_collapsed: false,
            current_theme_id: "opencode".to_string(),

            update_feed_url: default_feed_url(),
            update_status: UpdateStatus::Idle,
            update_info: None,
            update_error: None,
            update_last_checked: None,

            dialog_stack: Vec::new(),

            prompt_text: String::new(),
            prompt_files: Vec::new(),
            prompt_history: Vec::new(),
            prompt_history_index: None,

            session_search_query: String::new(),
            command_search_query: String::new(),

            #[cfg(feature = "trading")]
            portfolio: None,
            #[cfg(feature = "trading")]
            risk_metrics: None,
            #[cfg(feature = "trading")]
            paper_trading: None,
            #[cfg(feature = "trading")]
            watchlist: Vec::new(),
        }
    }
}

impl Global for AppState {}

// ============================================================================
// Supporting Types
// ============================================================================

/// Active view in the application
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ActiveView {
    #[default]
    Sessions,
    Chat,
    Settings,
}

/// Persona selection
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Persona {
    #[default]
    Zee,
    Stanley,
    Johny,
}

impl Persona {
    pub fn name(&self) -> &'static str {
        match self {
            Persona::Zee => "Zee",
            Persona::Stanley => "Stanley",
            Persona::Johny => "Johny",
        }
    }

    pub fn description(&self) -> &'static str {
        match self {
            Persona::Zee => "Personal Assistant",
            Persona::Stanley => "Trading & Finance",
            Persona::Johny => "Learning & Study",
        }
    }

    pub fn agent_name(&self) -> &'static str {
        match self {
            Persona::Zee => "zee",
            Persona::Stanley => "stanley",
            Persona::Johny => "johny",
        }
    }
}

/// Dialog types that can be opened
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DialogType {
    ModelPicker,
    ProviderConfig,
    Settings,
    CommandPalette,
    ThemePicker,
    SessionRename(String), // session_id
    Confirm {
        title: String,
        message: String,
        confirm_label: String,
        on_confirm: ConfirmAction,
    },
}

/// Actions that can be confirmed
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfirmAction {
    DeleteSession(String),
    ClearChat(String),
}

/// A file attachment for the prompt
#[derive(Debug, Clone)]
pub struct FileAttachment {
    pub path: String,
    pub name: String,
    pub size: u64,
}

/// A message that is currently being streamed
#[derive(Debug, Clone)]
pub struct StreamingMessage {
    pub session_id: String,
    pub message_id: String,
    pub content: String,
    pub tool_calls: Vec<StreamingToolCall>,
    pub reasoning: Option<String>,
    pub is_complete: bool,
}

/// A tool call being streamed
#[derive(Debug, Clone)]
pub struct StreamingToolCall {
    pub id: String,
    pub name: String,
    pub input: String,
    pub output: Option<String>,
    pub status: ToolCallStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolCallStatus {
    Pending,
    Running,
    Success,
    Error,
}

// ============================================================================
// State Actions
// ============================================================================

impl AppState {
    /// Set connection status
    pub fn set_connected(&mut self, connected: bool) {
        self.connected = connected;
        self.connecting = false;
    }

    /// Set sessions list
    pub fn set_sessions(&mut self, sessions: Vec<Session>) {
        self.sessions = sessions;
        self.sessions_loading = false;
    }

    /// Add a new session
    pub fn add_session(&mut self, session: Session) {
        self.sessions.insert(0, session);
    }

    /// Remove a session by ID
    pub fn remove_session(&mut self, session_id: &str) {
        self.sessions.retain(|s| s.id != session_id);
        self.messages.remove(session_id);
        if self.active_session_id.as_deref() == Some(session_id) {
            self.active_session_id = None;
            self.active_view = ActiveView::Sessions;
        }
    }

    /// Update a session
    pub fn update_session(&mut self, session: Session) {
        if let Some(existing) = self.sessions.iter_mut().find(|s| s.id == session.id) {
            *existing = session;
        }
    }

    /// Set active session and switch to chat view
    pub fn set_active_session(&mut self, session_id: Option<String>) {
        self.active_session_id = session_id.clone();
        if session_id.is_some() {
            self.active_view = ActiveView::Chat;
        }
    }

    /// Set messages for a session
    pub fn set_messages(&mut self, session_id: &str, messages: Vec<Message>) {
        self.messages.insert(session_id.to_string(), messages);
        self.messages_loading.remove(session_id);
    }

    /// Add a message to a session
    pub fn add_message(&mut self, session_id: &str, message: Message) {
        self.messages
            .entry(session_id.to_string())
            .or_default()
            .push(message);
    }

    /// Start streaming a message
    pub fn start_streaming(&mut self, session_id: &str, message_id: &str) {
        self.streaming_message = Some(StreamingMessage {
            session_id: session_id.to_string(),
            message_id: message_id.to_string(),
            content: String::new(),
            tool_calls: Vec::new(),
            reasoning: None,
            is_complete: false,
        });
    }

    /// Update streaming message content
    pub fn update_streaming_content(&mut self, content: &str) {
        if let Some(ref mut streaming) = self.streaming_message {
            streaming.content.push_str(content);
        }
    }

    /// Update streaming tool call
    pub fn update_streaming_tool_call(&mut self, tool_call: StreamingToolCall) {
        if let Some(ref mut streaming) = self.streaming_message {
            if let Some(existing) = streaming.tool_calls.iter_mut().find(|tc| tc.id == tool_call.id) {
                *existing = tool_call;
            } else {
                streaming.tool_calls.push(tool_call);
            }
        }
    }

    /// Complete streaming
    pub fn complete_streaming(&mut self) {
        if let Some(ref mut streaming) = self.streaming_message {
            streaming.is_complete = true;
        }
        // The message will be moved to messages when the final message arrives
    }

    /// Set providers
    pub fn set_providers(&mut self, providers: Vec<Provider>) {
        self.providers = providers;
    }

    /// Set models
    pub fn set_models(&mut self, models: Vec<Model>) {
        self.models = models;
    }

    /// Select a model
    pub fn select_model(&mut self, provider_id: &str, model_id: &str) {
        self.selected_provider_id = Some(provider_id.to_string());
        self.selected_model_id = Some(model_id.to_string());
    }

    /// Change active view
    pub fn set_view(&mut self, view: ActiveView) {
        self.active_view = view;
    }

    /// Change active persona
    pub fn set_persona(&mut self, persona: Persona) {
        self.active_persona = persona;
    }

    /// Toggle sidebar
    pub fn toggle_sidebar(&mut self) {
        self.sidebar_collapsed = !self.sidebar_collapsed;
    }

    /// Open a dialog
    pub fn open_dialog(&mut self, dialog: DialogType) {
        // Prevent duplicate dialogs
        if !self.dialog_stack.iter().any(|d| std::mem::discriminant(d) == std::mem::discriminant(&dialog)) {
            self.dialog_stack.push(dialog);
        }
    }

    /// Close the top dialog
    pub fn close_dialog(&mut self) {
        self.dialog_stack.pop();
    }

    /// Close all dialogs
    pub fn close_all_dialogs(&mut self) {
        self.dialog_stack.clear();
    }

    /// Get the current dialog (if any)
    pub fn current_dialog(&self) -> Option<&DialogType> {
        self.dialog_stack.last()
    }

    /// Check if any dialog is open
    pub fn has_dialog(&self) -> bool {
        !self.dialog_stack.is_empty()
    }

    /// Set prompt text
    pub fn set_prompt(&mut self, text: String) {
        self.prompt_text = text;
    }

    /// Clear prompt
    pub fn clear_prompt(&mut self) {
        self.prompt_text.clear();
        self.prompt_files.clear();
    }

    /// Add file attachment
    pub fn add_file(&mut self, file: FileAttachment) {
        self.prompt_files.push(file);
    }

    /// Remove file attachment
    pub fn remove_file(&mut self, index: usize) {
        if index < self.prompt_files.len() {
            self.prompt_files.remove(index);
        }
    }

    /// Add to prompt history
    pub fn add_to_history(&mut self, text: String) {
        // Avoid duplicates at the end
        if self.prompt_history.last() != Some(&text) {
            self.prompt_history.push(text);
        }
        self.prompt_history_index = None;
    }

    /// Navigate prompt history up
    pub fn history_up(&mut self) {
        if self.prompt_history.is_empty() {
            return;
        }
        let new_index = match self.prompt_history_index {
            Some(i) if i > 0 => i - 1,
            Some(i) => i,
            None => self.prompt_history.len() - 1,
        };
        self.prompt_history_index = Some(new_index);
        self.prompt_text = self.prompt_history[new_index].clone();
    }

    /// Navigate prompt history down
    pub fn history_down(&mut self) {
        if let Some(i) = self.prompt_history_index {
            if i < self.prompt_history.len() - 1 {
                let new_index = i + 1;
                self.prompt_history_index = Some(new_index);
                self.prompt_text = self.prompt_history[new_index].clone();
            } else {
                self.prompt_history_index = None;
                self.prompt_text.clear();
            }
        }
    }

    /// Set theme
    pub fn set_theme(&mut self, theme_id: String) {
        self.current_theme_id = theme_id;
    }

    /// Get filtered sessions based on search query
    pub fn filtered_sessions(&self) -> Vec<&Session> {
        if self.session_search_query.is_empty() {
            self.sessions.iter().collect()
        } else {
            let query = self.session_search_query.to_lowercase();
            self.sessions
                .iter()
                .filter(|s| {
                    s.title
                        .as_ref()
                        .map(|t| t.to_lowercase().contains(&query))
                        .unwrap_or(false)
                        || s.id.to_lowercase().contains(&query)
                })
                .collect()
        }
    }

    /// Get messages for the active session
    pub fn active_messages(&self) -> Option<&Vec<Message>> {
        self.active_session_id.as_ref().and_then(|id| self.messages.get(id))
    }

    /// Get the active session
    pub fn active_session(&self) -> Option<&Session> {
        self.active_session_id.as_ref().and_then(|id| {
            self.sessions.iter().find(|s| &s.id == id)
        })
    }

    /// Check if messages are loading for active session
    pub fn is_messages_loading(&self) -> bool {
        self.active_session_id.as_ref().map(|id| {
            self.messages_loading.get(id).copied().unwrap_or(false)
        }).unwrap_or(false)
    }

    /// Get the currently selected model name
    pub fn selected_model_name(&self) -> Option<String> {
        self.selected_model_id.as_ref().and_then(|model_id| {
            self.models.iter().find(|m| &m.id == model_id).map(|m| m.name.clone())
        })
    }

    // ========================================================================
    // Session Status
    // ========================================================================

    /// Update session status (busy/idle)
    pub fn set_session_status(&mut self, session_id: &str, status: SessionStatus) {
        self.session_status.insert(session_id.to_string(), status);
    }

    /// Get session status
    pub fn get_session_status(&self, session_id: &str) -> Option<&SessionStatus> {
        self.session_status.get(session_id)
    }

    /// Check if session is busy
    pub fn is_session_busy(&self, session_id: &str) -> bool {
        self.session_status
            .get(session_id)
            .map(|s| s.busy)
            .unwrap_or(false)
    }

    // ========================================================================
    // Message Parts (Real-time streaming)
    // ========================================================================

    /// Update a message part
    pub fn update_part(&mut self, part: Part) {
        let parts = self.parts.entry(part.message_id.clone()).or_default();

        // Find existing part by ID and update, or insert
        if let Some(existing) = parts.iter_mut().find(|p| p.id == part.id) {
            *existing = part;
        } else {
            // Insert in sorted order by ID
            let pos = parts.iter().position(|p| p.id > part.id).unwrap_or(parts.len());
            parts.insert(pos, part);
        }
    }

    /// Remove a message part
    pub fn remove_part(&mut self, message_id: &str, part_id: &str) {
        if let Some(parts) = self.parts.get_mut(message_id) {
            parts.retain(|p| p.id != part_id);
        }
    }

    /// Get parts for a message
    pub fn get_parts(&self, message_id: &str) -> Option<&Vec<Part>> {
        self.parts.get(message_id)
    }

    // ========================================================================
    // Update State
    // ========================================================================

    pub fn apply_update_check(&mut self, check: UpdateCheck) {
        self.update_status = check.status;
        self.update_info = check.info;
        self.update_error = check.error;
        self.update_last_checked = check.checked_at;
    }

    pub fn set_update_status(&mut self, status: UpdateStatus) {
        self.update_status = status;
    }

    // ========================================================================
    // Permission Event Handlers
    // ========================================================================

    /// Handle permission.asked event
    pub fn handle_permission_asked(&mut self, request: PermissionRequest) {
        let session_id = request.session_id.clone();
        let permissions = self.permissions.entry(session_id).or_default();

        // Find existing request by ID and update, or insert
        if let Some(existing) = permissions.iter_mut().find(|p| p.id == request.id) {
            *existing = request;
        } else {
            // Insert maintaining sort order by ID
            let pos = permissions.iter().position(|p| p.id > request.id).unwrap_or(permissions.len());
            permissions.insert(pos, request);
        }
    }

    /// Handle permission.replied event
    pub fn handle_permission_replied(&mut self, session_id: &str, request_id: &str) {
        if let Some(permissions) = self.permissions.get_mut(session_id) {
            permissions.retain(|p| p.id != request_id);
        }
    }

    /// Get pending permissions for a session
    pub fn get_pending_permissions(&self, session_id: &str) -> Option<&Vec<PermissionRequest>> {
        self.permissions.get(session_id).filter(|v| !v.is_empty())
    }

    /// Get the next pending permission for a session
    pub fn get_next_permission(&self, session_id: &str) -> Option<&PermissionRequest> {
        self.permissions.get(session_id).and_then(|v| v.first())
    }

    /// Check if session has pending permissions
    pub fn has_pending_permissions(&self, session_id: &str) -> bool {
        self.permissions
            .get(session_id)
            .map(|v| !v.is_empty())
            .unwrap_or(false)
    }

    // ========================================================================
    // Question Event Handlers
    // ========================================================================

    /// Handle question.asked event
    pub fn handle_question_asked(&mut self, request: QuestionRequest) {
        let session_id = request.session_id.clone();
        let questions = self.questions.entry(session_id).or_default();

        // Find existing request by ID and update, or insert
        if let Some(existing) = questions.iter_mut().find(|q| q.id == request.id) {
            *existing = request;
        } else {
            // Insert maintaining sort order by ID
            let pos = questions.iter().position(|q| q.id > request.id).unwrap_or(questions.len());
            questions.insert(pos, request);
        }
    }

    /// Handle question.replied event
    pub fn handle_question_replied(&mut self, session_id: &str, request_id: &str) {
        if let Some(questions) = self.questions.get_mut(session_id) {
            questions.retain(|q| q.id != request_id);
        }
    }

    /// Get pending questions for a session
    pub fn get_pending_questions(&self, session_id: &str) -> Option<&Vec<QuestionRequest>> {
        self.questions.get(session_id).filter(|v| !v.is_empty())
    }

    /// Get the next pending question for a session
    pub fn get_next_question(&self, session_id: &str) -> Option<&QuestionRequest> {
        self.questions.get(session_id).and_then(|v| v.first())
    }

    /// Check if session has pending questions
    pub fn has_pending_questions(&self, session_id: &str) -> bool {
        self.questions
            .get(session_id)
            .map(|v| !v.is_empty())
            .unwrap_or(false)
    }

    /// Check if session has any pending prompts (permissions or questions)
    pub fn has_pending_prompts(&self, session_id: &str) -> bool {
        self.has_pending_permissions(session_id) || self.has_pending_questions(session_id)
    }

    // ========================================================================
    // Trading State (Stanley persona, behind feature flag)
    // ========================================================================

    /// Set the portfolio
    #[cfg(feature = "trading")]
    pub fn set_portfolio(&mut self, portfolio: Portfolio) {
        self.portfolio = Some(portfolio);
    }

    /// Clear the portfolio
    #[cfg(feature = "trading")]
    pub fn clear_portfolio(&mut self) {
        self.portfolio = None;
    }

    /// Set risk metrics
    #[cfg(feature = "trading")]
    pub fn set_risk_metrics(&mut self, metrics: RiskMetrics) {
        self.risk_metrics = Some(metrics);
    }

    /// Clear risk metrics
    #[cfg(feature = "trading")]
    pub fn clear_risk_metrics(&mut self) {
        self.risk_metrics = None;
    }

    /// Set paper trading status
    #[cfg(feature = "trading")]
    pub fn set_paper_trading(&mut self, status: PaperTradingStatus) {
        self.paper_trading = Some(status);
    }

    /// Clear paper trading status
    #[cfg(feature = "trading")]
    pub fn clear_paper_trading(&mut self) {
        self.paper_trading = None;
    }

    /// Add symbol to watchlist
    #[cfg(feature = "trading")]
    pub fn add_to_watchlist(&mut self, symbol: String) {
        let symbol = symbol.to_uppercase();
        if !self.watchlist.contains(&symbol) {
            self.watchlist.push(symbol);
        }
    }

    /// Remove symbol from watchlist
    #[cfg(feature = "trading")]
    pub fn remove_from_watchlist(&mut self, symbol: &str) {
        let symbol = symbol.to_uppercase();
        self.watchlist.retain(|s| s != &symbol);
    }

    /// Clear watchlist
    #[cfg(feature = "trading")]
    pub fn clear_watchlist(&mut self) {
        self.watchlist.clear();
    }
}

// ============================================================================
// State Initialization
// ============================================================================

/// Initialize the application state
pub fn init(cx: &mut App) {
    cx.set_global(AppState::default());
    tracing::debug!("Application state initialized");
}

/// Get mutable access to the app state (for use in callbacks)
pub fn with_state<R>(cx: &mut App, f: impl FnOnce(&mut AppState) -> R) -> R {
    let state = cx.global_mut::<AppState>();
    f(state)
}
