//! Message component for chat view
//!
//! Renders individual messages with markdown support.

use crate::api::types::MessageRole;

/// A single message in the chat
pub struct MessageComponent {
    pub role: MessageRole,
    pub content: String,
    pub timestamp: i64,
}

impl MessageComponent {
    pub fn new(role: MessageRole, content: String, timestamp: i64) -> Self {
        Self {
            role,
            content,
            timestamp,
        }
    }
}
