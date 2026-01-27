//! Chat view for interacting with the agent
//!
//! Displays messages and allows sending new ones with streaming support.

use gpui::prelude::*;
use gpui::*;
use crate::api::types::{Message, MessagePart, MessageRole, SendMessageRequest};
use crate::api::ApiState;
use crate::components::prompt_input::{PromptInput, SendMessage};
use crate::state::{AppState, StreamingMessage, ToolCallStatus};
use crate::theme::Theme;

/// Chat view
pub struct ChatView {
    prompt_input: Entity<PromptInput>,
    is_sending: bool,
}

impl ChatView {
    pub fn new(cx: &mut Context<Self>) -> Self {
        // Create the prompt input component
        let prompt_input = cx.new(|cx| PromptInput::new(cx));

        // Subscribe to SendMessage events from the prompt input
        cx.subscribe(&prompt_input, |this, _prompt, event: &SendMessage, cx| {
            this.send_message_with_content(event.content.clone(), cx);
        }).detach();

        Self {
            prompt_input,
            is_sending: false,
        }
    }

    fn send_message_with_content(&mut self, content: String, cx: &mut Context<Self>) {
        if content.trim().is_empty() || self.is_sending {
            return;
        }

        // Set loading state on prompt input
        self.prompt_input.update(cx, |input, cx| {
            input.set_loading(true, cx);
        });

        self.is_sending = true;
        cx.notify();

        let session_id = cx.global::<AppState>().active_session_id.clone();
        let api_state = cx.global::<ApiState>();
        let client = api_state.client.clone();
        let runtime = api_state.runtime.clone();

        cx.spawn(async move |this, cx| {
            if let Some(session_id) = session_id {
                let request = SendMessageRequest {
                    content,
                    agent: None,
                    model: None,
                    files: vec![],
                };

                // For now, use non-streaming API
                // TODO: Implement streaming with send_message_stream
                let session_id_clone = session_id.clone();
                match runtime.spawn(async move {
                    client.send_message(&session_id_clone, request).await
                }).await {
                    Ok(Ok(message)) => {
                        let _ = cx.update(|cx| {
                            let state = cx.global_mut::<AppState>();
                            state.add_message(&session_id, message);
                        });
                    }
                    Ok(Err(e)) => {
                        tracing::error!("Failed to send message: {}", e);
                    }
                    Err(e) => {
                        tracing::error!("Failed to spawn send message task: {}", e);
                    }
                }
            }

            if let Some(this) = this.upgrade() {
                this.update(cx, |this, cx| {
                    this.is_sending = false;
                    // Clear and reset loading state on prompt input
                    this.prompt_input.update(cx, |input, cx| {
                        input.clear(cx);
                        input.set_loading(false, cx);
                    });
                    cx.notify();
                });
            }
        }).detach();
    }

    fn render_no_session(&self, cx: &Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();

        div()
            .flex_1()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap(px(16.0))
            .child(
                div()
                    .w(px(80.0))
                    .h(px(80.0))
                    .rounded(px(16.0))
                    .bg(theme.background_element)
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(
                        div()
                            .text_3xl()
                            .child("💬")
                    )
            )
            .child(
                div()
                    .text_xl()
                    .font_weight(FontWeight::MEDIUM)
                    .child("No Session Selected")
            )
            .child(
                div()
                    .text_color(theme.text_muted)
                    .child("Select a session from the sidebar or create a new one")
            )
    }

    fn render_messages(&self, messages: &[Message], streaming: &Option<StreamingMessage>, cx: &Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();

        div()
            .id("messages-scroll")
            .flex_1()
            .flex().flex_col()
            .p(px(20.0))
            .flex()
            .flex_col()
            .gap(px(16.0))
            .children(
                messages.iter().map(|msg| self.render_message(msg, theme))
            )
            .when(streaming.is_some(), |el| {
                let streaming = streaming.as_ref().unwrap();
                el.child(self.render_streaming_message(streaming, theme))
            })
    }

    fn render_message(&self, message: &Message, theme: &Theme) -> impl IntoElement {
        let is_user = message.role == MessageRole::User;

        let (align, bg, border_radius) = if is_user {
            ("flex-end", theme.primary.opacity(0.15), px(16.0))
        } else {
            ("flex-start", theme.background_element, px(16.0))
        };

        div()
            .w_full()
            .flex()
            .when(is_user, |el| el.justify_end())
            .child(
                div()
                    .max_w(rems(48.0))
                    .px(px(16.0))
                    .py(px(12.0))
                    .rounded(border_radius)
                    .bg(bg)
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(8.0))
                            // Message content
                            .children(self.render_message_parts(&message.parts, theme))
                            // Message summary/body fallback
                            .when(message.parts.is_empty() && message.summary.is_some(), |el| {
                                let body = message.summary.as_ref()
                                    .and_then(|s| s.body.clone())
                                    .unwrap_or_default();
                                el.child(
                                    div()
                                        .child(body)
                                )
                            })
                    )
            )
    }

    fn render_message_parts(&self, parts: &[MessagePart], theme: &Theme) -> Vec<impl IntoElement> {
        parts.iter().map(|part| {
            match part {
                MessagePart::Text { text } => {
                    div()
                        .child(text.clone())
                        .into_any_element()
                }
                MessagePart::ToolUse { id, name, input } => {
                    self.render_tool_use(id, name, input, theme)
                        .into_any_element()
                }
                MessagePart::ToolResult { tool_use_id, content, is_error } => {
                    self.render_tool_result(tool_use_id, content, *is_error, theme)
                        .into_any_element()
                }
                MessagePart::Reasoning { text } => {
                    self.render_reasoning(text, theme)
                        .into_any_element()
                }
            }
        }).collect()
    }

    fn render_tool_use(&self, _id: &str, name: &str, input: &serde_json::Value, theme: &Theme) -> impl IntoElement {
        div()
            .w_full()
            .rounded(px(8.0))
            .bg(theme.background)
            .border_1()
            .border_color(theme.border_subtle)
            .overflow_hidden()
            .child(
                // Header
                div()
                    .px(px(12.0))
                    .py(px(8.0))
                    .bg(theme.background_element)
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(
                        div()
                            .w(px(6.0))
                            .h(px(6.0))
                            .rounded_full()
                            .bg(theme.info)
                    )
                    .child(
                        div()
                            .text_sm()
                            .font_weight(FontWeight::MEDIUM)
                            .child(name.to_string())
                    )
            )
            .when(!input.is_null(), |el| {
                let input_str = serde_json::to_string_pretty(input).unwrap_or_default();
                if input_str.len() < 500 {
                    el.child(
                        div()
                            .px(px(12.0))
                            .py(px(8.0))
                            .text_xs()
                            .font_family("monospace")
                            .text_color(theme.text_muted)
                            .child(input_str)
                    )
                } else {
                    el.child(
                        div()
                            .px(px(12.0))
                            .py(px(8.0))
                            .text_xs()
                            .text_color(theme.text_muted)
                            .child("[Input truncated]")
                    )
                }
            })
    }

    fn render_tool_result(&self, _tool_use_id: &str, content: &str, is_error: bool, theme: &Theme) -> impl IntoElement {
        let (status_color, status_text) = if is_error {
            (theme.error, "Error")
        } else {
            (theme.success, "Success")
        };

        div()
            .w_full()
            .rounded(px(8.0))
            .bg(theme.background)
            .border_1()
            .border_color(theme.border_subtle)
            .overflow_hidden()
            .child(
                div()
                    .px(px(12.0))
                    .py(px(8.0))
                    .bg(theme.background_element)
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(
                        div()
                            .w(px(6.0))
                            .h(px(6.0))
                            .rounded_full()
                            .bg(status_color)
                    )
                    .child(
                        div()
                            .text_sm()
                            .font_weight(FontWeight::MEDIUM)
                            .child(status_text)
                    )
            )
            .when(!content.is_empty(), |el| {
                let display_content = if content.len() > 1000 {
                    format!("{}...", &content[..1000])
                } else {
                    content.to_string()
                };
                el.child(
                    div()
                        .px(px(12.0))
                        .py(px(8.0))
                        .text_xs()
                        .font_family("monospace")
                        .text_color(theme.text_muted)
                        .child(display_content)
                )
            })
    }

    fn render_reasoning(&self, text: &str, theme: &Theme) -> impl IntoElement {
        div()
            .w_full()
            .rounded(px(8.0))
            .bg(theme.secondary.opacity(0.1))
            .border_1()
            .border_color(theme.secondary.opacity(0.3))
            .child(
                div()
                    .px(px(12.0))
                    .py(px(8.0))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.0))
                            .mb(px(4.0))
                            .child(
                                div()
                                    .text_xs()
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(theme.secondary)
                                    .child("Thinking...")
                            )
                    )
                    .child(
                        div()
                            .text_sm()
                            .text_color(theme.text_muted)
                            .child(text.to_string())
                    )
            )
    }

    fn render_streaming_message(&self, streaming: &StreamingMessage, theme: &Theme) -> impl IntoElement {
        div()
            .w_full()
            .flex()
            .child(
                div()
                    .max_w(rems(48.0))
                    .px(px(16.0))
                    .py(px(12.0))
                    .rounded(px(16.0))
                    .bg(theme.background_element)
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(8.0))
                            // Reasoning section
                            .when(streaming.reasoning.is_some(), |el| {
                                let reasoning = streaming.reasoning.as_ref().unwrap();
                                el.child(self.render_reasoning(reasoning, theme))
                            })
                            // Tool calls
                            .children(
                                streaming.tool_calls.iter().map(|tc| {
                                    self.render_streaming_tool_call(tc, theme)
                                })
                            )
                            // Content
                            .when(!streaming.content.is_empty(), |el| {
                                el.child(
                                    div()
                                        .child(streaming.content.clone())
                                )
                            })
                            // Loading indicator if not complete and no content
                            .when(!streaming.is_complete && streaming.content.is_empty() && streaming.tool_calls.is_empty(), |el| {
                                el.child(
                                    div()
                                        .flex()
                                        .items_center()
                                        .gap(px(8.0))
                                        .child(
                                            div()
                                                .w(px(8.0))
                                                .h(px(8.0))
                                                .rounded_full()
                                                .bg(theme.primary)
                                        )
                                        .child(
                                            div()
                                                .text_color(theme.text_muted)
                                                .child("Generating...")
                                        )
                                )
                            })
                    )
            )
    }

    fn render_streaming_tool_call(&self, tc: &crate::state::StreamingToolCall, theme: &Theme) -> impl IntoElement {
        let (status_color, status_text) = match tc.status {
            ToolCallStatus::Pending => (theme.text_muted, "Pending"),
            ToolCallStatus::Running => (theme.warning, "Running"),
            ToolCallStatus::Success => (theme.success, "Success"),
            ToolCallStatus::Error => (theme.error, "Error"),
        };

        div()
            .w_full()
            .rounded(px(8.0))
            .bg(theme.background)
            .border_1()
            .border_color(theme.border_subtle)
            .overflow_hidden()
            .child(
                div()
                    .px(px(12.0))
                    .py(px(8.0))
                    .bg(theme.background_element)
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(8.0))
                            .child(
                                div()
                                    .w(px(6.0))
                                    .h(px(6.0))
                                    .rounded_full()
                                    .bg(status_color)
                            )
                            .child(
                                div()
                                    .text_sm()
                                    .font_weight(FontWeight::MEDIUM)
                                    .child(tc.name.clone())
                            )
                    )
                    .child(
                        div()
                            .text_xs()
                            .text_color(theme.text_muted)
                            .child(status_text)
                    )
            )
            .when(tc.output.is_some(), |el| {
                let output = tc.output.as_ref().unwrap();
                let display = if output.len() > 500 {
                    format!("{}...", &output[..500])
                } else {
                    output.clone()
                };
                el.child(
                    div()
                        .px(px(12.0))
                        .py(px(8.0))
                        .text_xs()
                        .font_family("monospace")
                        .text_color(theme.text_muted)
                        .child(display)
                )
            })
    }

}

impl Render for ChatView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let state = cx.global::<AppState>();
        let theme = cx.global::<Theme>();

        let has_session = state.active_session_id.is_some();
        let messages = state.active_messages();
        let streaming = &state.streaming_message;

        div()
            .flex()
            .flex_col()
            .flex_1()
            .bg(theme.background_panel)
            .child(
                if has_session {
                    if let Some(messages) = messages {
                        if messages.is_empty() && streaming.is_none() {
                            // Empty chat state
                            self.render_empty_chat(cx).into_any_element()
                        } else {
                            self.render_messages(messages, streaming, cx).into_any_element()
                        }
                    } else {
                        // Loading messages
                        self.render_loading(cx).into_any_element()
                    }
                } else {
                    self.render_no_session(cx).into_any_element()
                }
            )
            .child(self.prompt_input.clone())
    }
}

impl ChatView {
    fn render_empty_chat(&self, cx: &Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let state = cx.global::<AppState>();
        let persona = state.active_persona;

        let persona_accent = match persona {
            crate::state::Persona::Zee => theme.zee_accent,
            crate::state::Persona::Stanley => theme.stanley_accent,
            crate::state::Persona::Johny => theme.johny_accent,
        };

        div()
            .flex_1()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap(px(16.0))
            .child(
                div()
                    .w(px(80.0))
                    .h(px(80.0))
                    .rounded_full()
                    .bg(persona_accent.opacity(0.15))
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(
                        div()
                            .text_3xl()
                            .text_color(persona_accent)
                            .child(persona.name().chars().next().unwrap_or('?').to_string())
                    )
            )
            .child(
                div()
                    .text_xl()
                    .font_weight(FontWeight::MEDIUM)
                    .child(format!("Chat with {}", persona.name()))
            )
            .child(
                div()
                    .text_color(theme.text_muted)
                    .text_center()
                    .max_w(px(400.0))
                    .child(format!("{} - {}", persona.name(), persona.description()))
            )
    }

    fn render_loading(&self, cx: &Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();

        div()
            .flex_1()
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(12.0))
                    .child(
                        div()
                            .w(px(32.0))
                            .h(px(32.0))
                            .rounded_full()
                            .border_2()
                            .border_color(theme.primary)
                    )
                    .child(
                        div()
                            .text_color(theme.text_muted)
                            .child("Loading messages...")
                    )
            )
    }
}
