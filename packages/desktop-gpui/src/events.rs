//! Real-time event subscription and handling
//!
//! This module manages the SSE connection to the daemon and dispatches events
//! to update application state in real-time.

use futures::StreamExt;
use gpui::*;
use std::pin::pin;
use std::time::Duration;

use crate::api::types::DaemonEvent;
use crate::api::ApiState;
use crate::state::AppState;

/// Start the event subscription loop
///
/// This spawns a background task that maintains an SSE connection to the daemon
/// and updates application state as events arrive.
pub fn start_event_loop(cx: &mut App) {
    let api_state = cx.global::<ApiState>();
    let client = api_state.client.clone();
    let runtime = api_state.runtime.clone();

    tracing::info!("Starting event subscription loop");

    cx.spawn(async move |cx| {
        let mut retry_delay = Duration::from_millis(100);
        let max_retry_delay = Duration::from_secs(30);

        loop {
            tracing::debug!("Connecting to event stream...");

            // Subscribe to events using the Tokio runtime
            let client_clone = client.clone();
            let subscribe_result = runtime
                .spawn(async move { client_clone.subscribe_events().await })
                .await;

            match subscribe_result {
                Ok(Ok(stream)) => {
                    // Reset retry delay on successful connection
                    retry_delay = Duration::from_millis(100);

                    let _ = cx.update(|cx| {
                        let state = cx.global_mut::<AppState>();
                        state.set_connected(true);
                        tracing::info!("Connected to daemon event stream");
                    });

                    // Pin the stream for iteration
                    let mut stream = pin!(stream);

                    // Process events from the stream
                    while let Some(event_result) = stream.next().await {
                        match event_result {
                            Ok(event) => {
                                let _ = cx.update(|cx| {
                                    handle_event(event, cx);
                                });
                            }
                            Err(e) => {
                                tracing::warn!("Event stream error: {}", e);
                                break;
                            }
                        }
                    }

                    tracing::warn!("Event stream ended, will reconnect...");
                }
                Ok(Err(e)) => {
                    tracing::warn!("Failed to subscribe to events: {}", e);
                }
                Err(e) => {
                    tracing::warn!("Failed to spawn subscribe task: {}", e);
                }
            }

            // Mark as disconnected
            let _ = cx.update(|cx| {
                let state = cx.global_mut::<AppState>();
                state.connected = false;
            });

            // Wait before retrying with exponential backoff
            tracing::debug!("Reconnecting in {:?}...", retry_delay);
            cx.background_executor().timer(retry_delay).await;

            // Increase retry delay with cap
            retry_delay = (retry_delay * 2).min(max_retry_delay);
        }
    })
    .detach();
}

/// Handle a single daemon event
fn handle_event(event: DaemonEvent, cx: &mut App) {
    let state = cx.global_mut::<AppState>();

    match event {
        DaemonEvent::SessionCreated(session) => {
            tracing::debug!("Session created: {}", session.id);
            state.add_session(session);
        }

        DaemonEvent::SessionUpdated(session) => {
            tracing::debug!("Session updated: {}", session.id);
            state.update_session(session);
        }

        DaemonEvent::SessionDeleted(session_id) => {
            tracing::debug!("Session deleted: {}", session_id);
            state.remove_session(&session_id);
        }

        DaemonEvent::SessionStatus { session_id, status } => {
            tracing::debug!("Session status: {} busy={}", session_id, status.busy);
            state.set_session_status(&session_id, status);
        }

        DaemonEvent::MessageCreated(event) => {
            tracing::debug!("Message created: {}", event.message.id);
            state.add_message(&event.session_id, event.message);
        }

        DaemonEvent::MessageUpdated(event) => {
            tracing::trace!("Message updated: {}", event.message.id);
            // Update existing message or add if not found
            if let Some(messages) = state.messages.get_mut(&event.session_id) {
                if let Some(existing) = messages.iter_mut().find(|m| m.id == event.message.id) {
                    *existing = event.message;
                } else {
                    messages.push(event.message);
                }
            } else {
                state.messages.insert(event.session_id.clone(), vec![event.message]);
            }
        }

        DaemonEvent::MessageRemoved {
            session_id,
            message_id,
        } => {
            tracing::debug!("Message removed: {}", message_id);
            if let Some(messages) = state.messages.get_mut(&session_id) {
                messages.retain(|m| m.id != message_id);
            }
            state.parts.remove(&message_id);
        }

        DaemonEvent::MessagePartUpdated(part) => {
            tracing::trace!("Part updated: {} for message {}", part.id, part.message_id);
            state.update_part(part);
        }

        DaemonEvent::MessagePartRemoved {
            message_id,
            part_id,
        } => {
            tracing::trace!("Part removed: {} from message {}", part_id, message_id);
            state.remove_part(&message_id, &part_id);
        }

        DaemonEvent::PermissionAsked(request) => {
            tracing::info!(
                "Permission asked: {} for session {}",
                request.permission,
                request.session_id
            );
            state.handle_permission_asked(request);
        }

        DaemonEvent::PermissionReplied {
            session_id,
            request_id,
        } => {
            tracing::debug!("Permission replied: {} in session {}", request_id, session_id);
            state.handle_permission_replied(&session_id, &request_id);
        }

        DaemonEvent::QuestionAsked(request) => {
            tracing::info!(
                "Question asked: {} questions for session {}",
                request.questions.len(),
                request.session_id
            );
            state.handle_question_asked(request);
        }

        DaemonEvent::QuestionReplied {
            session_id,
            request_id,
        } => {
            tracing::debug!("Question replied: {} in session {}", request_id, session_id);
            state.handle_question_replied(&session_id, &request_id);
        }

        DaemonEvent::ConnectionStatus(connected) => {
            tracing::info!("Connection status: {}", connected);
            state.set_connected(connected);
        }

        DaemonEvent::Keepalive => {
            tracing::trace!("Keepalive received");
        }
    }

    // Note: GPUI handles UI refresh automatically when state changes
}
