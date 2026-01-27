//! Agent Core HTTP client implementation with streaming support

use anyhow::{anyhow, Result};
use futures::{Stream, StreamExt};
use reqwest::{Client, Response};
use serde::{de::DeserializeOwned, Serialize};

use super::types::*;

/// HTTP client for Agent Core daemon
#[derive(Debug, Clone)]
pub struct AgentCoreClient {
    base_url: String,
    client: Client,
    directory: Option<String>,
}

impl AgentCoreClient {
    /// Create a new client with the given base URL
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.to_string(),
            client: Client::new(),
            directory: None,
        }
    }

    /// Set the working directory for requests
    pub fn with_directory(mut self, directory: String) -> Self {
        self.directory = Some(directory);
        self
    }

    /// Get the base URL
    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    // ========================================================================
    // Internal HTTP Methods
    // ========================================================================

    /// Make a GET request
    async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let mut request = self.client.get(format!("{}{}", self.base_url, path));

        if let Some(ref dir) = self.directory {
            request = request.header("x-agent-core-directory", dir);
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Request failed: {} {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ));
        }

        Ok(response.json().await?)
    }

    /// Make a POST request
    async fn post<T: DeserializeOwned, B: Serialize>(&self, path: &str, body: &B) -> Result<T> {
        let mut request = self
            .client
            .post(format!("{}{}", self.base_url, path))
            .json(body);

        if let Some(ref dir) = self.directory {
            request = request.header("x-agent-core-directory", dir);
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Request failed: {} {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ));
        }

        Ok(response.json().await?)
    }

    /// Make a POST request that returns a streaming response
    async fn post_stream<B: Serialize>(&self, path: &str, body: &B) -> Result<Response> {
        let mut request = self
            .client
            .post(format!("{}{}", self.base_url, path))
            .json(body);

        if let Some(ref dir) = self.directory {
            request = request.header("x-agent-core-directory", dir);
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Request failed: {} {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ));
        }

        Ok(response)
    }

    /// Make a PATCH request
    async fn patch<T: DeserializeOwned, B: Serialize>(&self, path: &str, body: &B) -> Result<T> {
        let mut request = self
            .client
            .patch(format!("{}{}", self.base_url, path))
            .json(body);

        if let Some(ref dir) = self.directory {
            request = request.header("x-agent-core-directory", dir);
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Request failed: {} {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ));
        }

        Ok(response.json().await?)
    }

    /// Make a PUT request
    async fn put<B: Serialize>(&self, path: &str, body: &B) -> Result<()> {
        let mut request = self
            .client
            .put(format!("{}{}", self.base_url, path))
            .json(body);

        if let Some(ref dir) = self.directory {
            request = request.header("x-agent-core-directory", dir);
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Request failed: {} {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ));
        }

        Ok(())
    }

    /// Make a DELETE request
    async fn delete(&self, path: &str) -> Result<()> {
        let mut request = self.client.delete(format!("{}{}", self.base_url, path));

        if let Some(ref dir) = self.directory {
            request = request.header("x-agent-core-directory", dir);
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Request failed: {} {}",
                response.status(),
                response.text().await.unwrap_or_default()
            ));
        }

        Ok(())
    }

    // ========================================================================
    // Health API
    // ========================================================================

    /// Check if the daemon is healthy
    pub async fn health(&self) -> Result<bool> {
        match self.client.get(format!("{}/global/health", self.base_url)).send().await {
            Ok(response) => Ok(response.status().is_success()),
            Err(_) => Ok(false),
        }
    }

    // ========================================================================
    // Session API
    // ========================================================================

    /// List all sessions
    pub async fn list_sessions(&self) -> Result<Vec<Session>> {
        self.get("/session").await
    }

    /// Get a session by ID
    pub async fn get_session(&self, id: &str) -> Result<Session> {
        self.get(&format!("/session/{}", id)).await
    }

    /// Create a new session
    pub async fn create_session(&self, request: CreateSessionRequest) -> Result<Session> {
        self.post("/session", &request).await
    }

    /// Update a session
    pub async fn update_session(&self, id: &str, request: UpdateSessionRequest) -> Result<Session> {
        self.patch(&format!("/session/{}", id), &request).await
    }

    /// Delete a session
    pub async fn delete_session(&self, id: &str) -> Result<()> {
        self.delete(&format!("/session/{}", id)).await
    }

    // ========================================================================
    // Message API
    // ========================================================================

    /// Get messages for a session
    pub async fn get_messages(&self, session_id: &str) -> Result<Vec<Message>> {
        self.get(&format!("/session/{}/messages", session_id)).await
    }

    /// Send a message to a session (non-streaming, waits for completion)
    pub async fn send_message(&self, session_id: &str, request: SendMessageRequest) -> Result<Message> {
        self.post(&format!("/session/{}/message", session_id), &request).await
    }

    /// Send a message to a session with streaming response
    pub async fn send_message_stream(
        &self,
        session_id: &str,
        request: SendMessageRequest,
    ) -> Result<impl Stream<Item = Result<StreamEvent>>> {
        let response = self.post_stream(&format!("/session/{}/message", session_id), &request).await?;
        Ok(parse_sse_stream(response))
    }

    /// Abort the current message generation
    pub async fn abort_message(&self, session_id: &str) -> Result<()> {
        self.post(&format!("/session/{}/abort", session_id), &()).await
    }

    // ========================================================================
    // Permission API
    // ========================================================================

    /// Reply to a permission request
    pub async fn reply_permission(&self, request: PermissionReplyRequest) -> Result<()> {
        self.post("/permission/reply", &request).await
    }

    /// List pending permission requests
    pub async fn list_permissions(&self) -> Result<Vec<PermissionRequest>> {
        self.get("/permission").await
    }

    // ========================================================================
    // Question API
    // ========================================================================

    /// Reply to a question request
    pub async fn reply_question(&self, request: QuestionReplyRequest) -> Result<()> {
        self.post("/question/reply", &request).await
    }

    /// List pending question requests
    pub async fn list_questions(&self) -> Result<Vec<QuestionRequest>> {
        self.get("/question").await
    }

    // ========================================================================
    // Provider API
    // ========================================================================

    /// List all providers
    pub async fn list_providers(&self) -> Result<Vec<Provider>> {
        self.get("/config/providers").await
    }

    /// Set API key for a provider
    pub async fn set_api_key(&self, provider_id: &str, api_key: &str) -> Result<()> {
        self.put(&format!("/auth/{}", provider_id), &serde_json::json!({ "apiKey": api_key })).await
    }

    // ========================================================================
    // Model API
    // ========================================================================

    /// List all models
    pub async fn list_models(&self) -> Result<Vec<Model>> {
        self.get("/model").await
    }

    // ========================================================================
    // Config API
    // ========================================================================

    /// Get configuration
    pub async fn get_config(&self) -> Result<Config> {
        self.get("/config").await
    }

    /// Update configuration
    pub async fn update_config(&self, config: &Config) -> Result<Config> {
        self.patch("/config", config).await
    }

    // ========================================================================
    // Event Subscription
    // ========================================================================

    /// Subscribe to SSE events from the daemon
    pub async fn subscribe_events(&self) -> Result<impl Stream<Item = Result<DaemonEvent>>> {
        let mut request = self.client.get(format!("{}/event", self.base_url));

        if let Some(ref dir) = self.directory {
            request = request.header("x-agent-core-directory", dir);
        }

        let response = request.send().await?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Event subscription failed: {}",
                response.status()
            ));
        }

        Ok(parse_daemon_events(response))
    }
}

// ============================================================================
// Stream Parsing
// ============================================================================

/// Parse SSE stream for message responses
fn parse_sse_stream(response: Response) -> impl Stream<Item = Result<StreamEvent>> {
    async_stream::stream! {
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                        buffer.push_str(&text);

                        // Process complete SSE messages
                        while let Some(pos) = buffer.find("\n\n") {
                            let message = buffer[..pos].to_string();
                            buffer = buffer[pos + 2..].to_string();

                            if let Some(event) = parse_sse_message(&message) {
                                yield Ok(event);
                            }
                        }
                    }
                }
                Err(e) => {
                    yield Err(anyhow!("Stream error: {}", e));
                    break;
                }
            }
        }

        // Handle any remaining buffer content
        if !buffer.is_empty() {
            if let Some(event) = parse_sse_message(&buffer) {
                yield Ok(event);
            }
        }
    }
}

/// Parse a single SSE message
fn parse_sse_message(message: &str) -> Option<StreamEvent> {
    let mut event_type = None;
    let mut data = None;

    for line in message.lines() {
        if let Some(value) = line.strip_prefix("event:") {
            event_type = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("data:") {
            data = Some(value.trim().to_string());
        }
    }

    let data = data?;
    let event_type = event_type.unwrap_or_else(|| "message".to_string());

    match event_type.as_str() {
        "content" | "text" => {
            Some(StreamEvent::Content(data))
        }
        "tool_call_start" => {
            if let Ok(tc) = serde_json::from_str(&data) {
                Some(StreamEvent::ToolCallStart(tc))
            } else {
                None
            }
        }
        "tool_call_end" => {
            if let Ok(tc) = serde_json::from_str(&data) {
                Some(StreamEvent::ToolCallEnd(tc))
            } else {
                None
            }
        }
        "reasoning" => {
            Some(StreamEvent::Reasoning(data))
        }
        "done" | "end" => {
            if let Ok(msg) = serde_json::from_str(&data) {
                Some(StreamEvent::Done(msg))
            } else {
                Some(StreamEvent::Done(Message::default()))
            }
        }
        "error" => {
            Some(StreamEvent::Error(data))
        }
        _ => {
            // Try to parse as generic JSON content
            Some(StreamEvent::Content(data))
        }
    }
}

/// Parse daemon event stream
fn parse_daemon_events(response: Response) -> impl Stream<Item = Result<DaemonEvent>> {
    async_stream::stream! {
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                        buffer.push_str(&text);

                        while let Some(pos) = buffer.find("\n\n") {
                            let message = buffer[..pos].to_string();
                            buffer = buffer[pos + 2..].to_string();

                            if let Some(event) = parse_daemon_event_message(&message) {
                                yield Ok(event);
                            }
                        }
                    }
                }
                Err(e) => {
                    yield Err(anyhow!("Event stream error: {}", e));
                    break;
                }
            }
        }
    }
}

/// Parse a single daemon event message
fn parse_daemon_event_message(message: &str) -> Option<DaemonEvent> {
    let mut event_type = None;
    let mut data = None;

    for line in message.lines() {
        if let Some(value) = line.strip_prefix("event:") {
            event_type = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("data:") {
            data = Some(value.trim().to_string());
        }
    }

    let data = data?;
    let event_type = event_type?;

    match event_type.as_str() {
        "session.created" | "session.updated" => {
            // Both events have the same structure with info field
            if let Ok(wrapper) = serde_json::from_str::<SessionEventWrapper>(&data) {
                if event_type == "session.created" {
                    Some(DaemonEvent::SessionCreated(wrapper.info))
                } else {
                    Some(DaemonEvent::SessionUpdated(wrapper.info))
                }
            } else {
                // Fallback: try direct session parsing
                serde_json::from_str(&data).ok().map(|s| {
                    if event_type == "session.created" {
                        DaemonEvent::SessionCreated(s)
                    } else {
                        DaemonEvent::SessionUpdated(s)
                    }
                })
            }
        }
        "session.deleted" => {
            serde_json::from_str::<SessionDeletedEvent>(&data)
                .ok()
                .map(|e| DaemonEvent::SessionDeleted(e.info.id))
        }
        "session.status" => {
            serde_json::from_str::<SessionStatusEvent>(&data)
                .ok()
                .map(|e| DaemonEvent::SessionStatus {
                    session_id: e.session_id,
                    status: e.status,
                })
        }
        "message.created" => {
            serde_json::from_str::<MessageEventWrapper>(&data)
                .ok()
                .map(|e| DaemonEvent::MessageCreated(MessageEvent {
                    session_id: e.info.session_id.clone(),
                    message: e.info,
                }))
        }
        "message.updated" => {
            serde_json::from_str::<MessageEventWrapper>(&data)
                .ok()
                .map(|e| DaemonEvent::MessageUpdated(MessageEvent {
                    session_id: e.info.session_id.clone(),
                    message: e.info,
                }))
        }
        "message.removed" => {
            serde_json::from_str::<MessageRemovedEvent>(&data)
                .ok()
                .map(|e| DaemonEvent::MessageRemoved {
                    session_id: e.session_id,
                    message_id: e.message_id,
                })
        }
        "message.part.updated" => {
            serde_json::from_str::<PartEventWrapper>(&data)
                .ok()
                .map(|e| DaemonEvent::MessagePartUpdated(e.part))
        }
        "message.part.removed" => {
            serde_json::from_str::<PartRemovedEvent>(&data)
                .ok()
                .map(|e| DaemonEvent::MessagePartRemoved {
                    message_id: e.message_id,
                    part_id: e.part_id,
                })
        }
        "permission.asked" => {
            serde_json::from_str::<PermissionRequest>(&data)
                .ok()
                .map(DaemonEvent::PermissionAsked)
        }
        "permission.replied" => {
            serde_json::from_str::<PermissionRepliedEvent>(&data)
                .ok()
                .map(|e| DaemonEvent::PermissionReplied {
                    session_id: e.session_id,
                    request_id: e.request_id,
                })
        }
        "question.asked" => {
            serde_json::from_str::<QuestionRequest>(&data)
                .ok()
                .map(DaemonEvent::QuestionAsked)
        }
        "question.replied" | "question.rejected" => {
            serde_json::from_str::<QuestionRepliedEvent>(&data)
                .ok()
                .map(|e| DaemonEvent::QuestionReplied {
                    session_id: e.session_id,
                    request_id: e.request_id,
                })
        }
        "connection.status" => {
            serde_json::from_str::<ConnectionStatusEvent>(&data)
                .ok()
                .map(|e| DaemonEvent::ConnectionStatus(e.connected))
        }
        "keepalive" => Some(DaemonEvent::Keepalive),
        _ => {
            tracing::trace!("Unknown daemon event type: {}", event_type);
            None
        }
    }
}

// Event wrapper types to match daemon's JSON structure

#[derive(serde::Deserialize)]
struct SessionEventWrapper {
    info: Session,
}

#[derive(serde::Deserialize)]
struct SessionDeletedEvent {
    info: SessionDeletedInfo,
}

#[derive(serde::Deserialize)]
struct SessionDeletedInfo {
    id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionStatusEvent {
    session_id: String,
    status: SessionStatus,
}

#[derive(serde::Deserialize)]
struct MessageEventWrapper {
    info: Message,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessageRemovedEvent {
    session_id: String,
    message_id: String,
}

#[derive(serde::Deserialize)]
struct PartEventWrapper {
    part: Part,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PartRemovedEvent {
    message_id: String,
    part_id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PermissionRepliedEvent {
    session_id: String,
    request_id: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuestionRepliedEvent {
    session_id: String,
    request_id: String,
}

#[derive(serde::Deserialize)]
struct ConnectionStatusEvent {
    connected: bool,
}
