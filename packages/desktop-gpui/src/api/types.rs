//! API types for Agent Core daemon

use serde::{Deserialize, Serialize};

// ============================================================================
// Session Types
// ============================================================================

/// Session information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub title: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<ModelInfo>,
    #[serde(default)]
    pub message_count: i32,
}

/// Model information for a session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub provider_id: String,
    pub model_id: String,
}

/// Request to create a new session
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreateSessionRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// Request to update a session
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSessionRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

// ============================================================================
// Message Types
// ============================================================================

/// Message information
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub role: MessageRole,
    pub time: MessageTime,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<MessageSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(default)]
    pub parts: Vec<MessagePart>,
}

/// Message role
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    #[default]
    User,
    Assistant,
}

/// Message timestamps
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MessageTime {
    pub created: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed: Option<i64>,
}

/// Message summary
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MessageSummary {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(default)]
    pub diffs: Vec<FileDiff>,
}

/// Message part (content or tool call)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessagePart {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(default)]
        is_error: bool,
    },
    Reasoning {
        text: String,
    },
}

/// File diff information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub file: String,
    #[serde(default)]
    pub before: String,
    #[serde(default)]
    pub after: String,
    #[serde(default)]
    pub additions: i32,
    #[serde(default)]
    pub deletions: i32,
}

/// Request to send a message
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub files: Vec<FileContent>,
}

/// File content for attachments
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
}

// ============================================================================
// Provider Types
// ============================================================================

/// Provider information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub models: Vec<String>,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub has_api_key: bool,
}

// ============================================================================
// Model Types
// ============================================================================

/// Model information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Model {
    pub id: String,
    pub provider_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub context_length: i32,
    #[serde(default)]
    pub input_cost: f64,
    #[serde(default)]
    pub output_cost: f64,
}

// ============================================================================
// Config Types
// ============================================================================

/// Configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
}

// ============================================================================
// Streaming Types
// ============================================================================

/// Events from message streaming
#[derive(Debug, Clone)]
pub enum StreamEvent {
    /// Text content
    Content(String),
    /// Tool call started
    ToolCallStart(ToolCall),
    /// Tool call completed
    ToolCallEnd(ToolCallResult),
    /// Reasoning/thinking content
    Reasoning(String),
    /// Stream completed with final message
    Done(Message),
    /// Error occurred
    Error(String),
}

/// Tool call information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub input: serde_json::Value,
}

/// Tool call result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallResult {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(default)]
    pub is_error: bool,
}

// ============================================================================
// Permission Types
// ============================================================================

/// Permission request from daemon
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRequest {
    pub id: String,
    pub session_id: String,
    pub permission: String,
    #[serde(default)]
    pub patterns: Vec<String>,
    #[serde(default)]
    pub metadata: serde_json::Value,
    #[serde(default)]
    pub always: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool: Option<ToolReference>,
}

/// Reference to the tool that triggered a permission/question
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolReference {
    pub message_id: String,
    pub call_id: String,
}

/// Request to reply to a permission
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionReplyRequest {
    pub request_id: String,
    pub decision: PermissionDecision,
}

/// Permission decision
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PermissionDecision {
    Allow,
    Reject,
    Always,
}

// ============================================================================
// Question Types
// ============================================================================

/// Question request from daemon
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionRequest {
    pub id: String,
    pub session_id: String,
    pub questions: Vec<QuestionInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool: Option<ToolReference>,
}

/// Individual question info
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionInfo {
    pub question: String,
    pub header: String,
    pub options: Vec<QuestionOption>,
    #[serde(default)]
    pub multiple: bool,
    #[serde(default = "default_true")]
    pub custom: bool,
}

fn default_true() -> bool {
    true
}

/// Question option
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOption {
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Request to reply to a question
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionReplyRequest {
    pub request_id: String,
    pub answers: Vec<Vec<String>>,
}

// ============================================================================
// Message Part Types (for streaming updates)
// ============================================================================

/// Message part for real-time updates
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Part {
    pub id: String,
    pub message_id: String,
    #[serde(flatten)]
    pub content: PartContent,
}

/// Part content variants
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PartContent {
    Text {
        text: String,
    },
    ToolUse {
        #[serde(rename = "toolUseId")]
        tool_use_id: String,
        name: String,
        input: serde_json::Value,
        #[serde(default)]
        state: ToolState,
    },
    Reasoning {
        text: String,
    },
}

/// Tool execution state
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ToolState {
    #[serde(default)]
    pub status: ToolStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(default)]
    pub is_error: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// Tool execution status
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ToolStatus {
    #[default]
    Pending,
    Running,
    Completed,
    Error,
}

// ============================================================================
// Session Status Types
// ============================================================================

/// Session status (busy/idle)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    #[serde(default)]
    pub busy: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
}

// ============================================================================
// Daemon Event Types
// ============================================================================

/// Events from the daemon event stream
#[derive(Debug, Clone)]
pub enum DaemonEvent {
    /// Session created
    SessionCreated(Session),
    /// Session updated
    SessionUpdated(Session),
    /// Session deleted
    SessionDeleted(String),
    /// Session status changed (busy/idle)
    SessionStatus { session_id: String, status: SessionStatus },
    /// Message created
    MessageCreated(MessageEvent),
    /// Message updated
    MessageUpdated(MessageEvent),
    /// Message removed
    MessageRemoved { session_id: String, message_id: String },
    /// Message part updated (streaming)
    MessagePartUpdated(Part),
    /// Message part removed
    MessagePartRemoved { message_id: String, part_id: String },
    /// Permission asked
    PermissionAsked(PermissionRequest),
    /// Permission replied
    PermissionReplied { session_id: String, request_id: String },
    /// Question asked
    QuestionAsked(QuestionRequest),
    /// Question replied
    QuestionReplied { session_id: String, request_id: String },
    /// Connection status changed
    ConnectionStatus(bool),
    /// Keepalive ping
    Keepalive,
}

/// Message event payload
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageEvent {
    pub session_id: String,
    pub message: Message,
}
