//! Permission prompt dialog
//!
//! Renders permission requests from the daemon and allows the user to approve or deny.

use gpui::prelude::*;
use gpui::*;

use crate::api::types::{PermissionDecision, PermissionReplyRequest, PermissionRequest};
use crate::api::ApiState;
use crate::theme::Theme;

/// Render a permission prompt overlay
///
/// This is rendered as a blocking overlay when a permission request is pending.
pub fn render_permission_prompt(
    request: &PermissionRequest,
    theme: &Theme,
    cx: &mut App,
) -> impl IntoElement {
    let request_id = request.id.clone();
    let session_id = request.session_id.clone();
    let permission = request.permission.clone();
    let patterns = request.patterns.clone();
    let always_options = request.always.clone();

    // Extract tool info if available
    let tool_info = request.tool.as_ref().map(|t| t.call_id.clone());

    // Get metadata for display
    let metadata_display = format_metadata(&request.metadata);

    div()
        .id("permission-prompt-overlay")
        .absolute()
        .inset_0()
        .bg(Hsla {
            h: 0.0,
            s: 0.0,
            l: 0.0,
            a: 0.6,
        })
        .flex()
        .items_center()
        .justify_center()
        .child(render_permission_card(
            request_id,
            session_id,
            permission,
            patterns,
            always_options,
            tool_info,
            metadata_display,
            theme,
            cx,
        ))
}

fn render_permission_card(
    request_id: String,
    _session_id: String,
    permission: String,
    patterns: Vec<String>,
    always_options: Vec<String>,
    tool_info: Option<String>,
    metadata_display: Option<String>,
    theme: &Theme,
    cx: &mut App,
) -> impl IntoElement {
    // Clone values for button closures
    let request_id_allow = request_id.clone();
    let request_id_deny = request_id.clone();
    let request_id_always = request_id.clone();

    div()
        .id("permission-card")
        .w(px(500.0))
        .max_h(px(600.0))
        .bg(theme.background_panel)
        .border_1()
        .border_color(theme.border)
        .rounded(px(12.0))
        .shadow_lg()
        .flex()
        .flex_col()
        .on_click(|_event, _window, _cx| {
            // Prevent click from propagating to overlay
        })
        // Header
        .child(
            div()
                .px(px(20.0))
                .py(px(16.0))
                .border_b_1()
                .border_color(theme.border)
                .flex()
                .items_center()
                .gap(px(12.0))
                .child(
                    // Warning icon
                    div()
                        .w(px(40.0))
                        .h(px(40.0))
                        .rounded_full()
                        .bg(theme.warning.opacity(0.15))
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            div()
                                .text_lg()
                                .text_color(theme.warning)
                                .child("⚠"),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(2.0))
                        .child(
                            div()
                                .text_lg()
                                .font_weight(FontWeight::SEMIBOLD)
                                .child("Permission Required"),
                        )
                        .child(
                            div()
                                .text_sm()
                                .text_color(theme.text_muted)
                                .child(format!("Tool: {}", permission)),
                        ),
                ),
        )
        // Content
        .child(
            div()
                .flex_1()
                .p(px(20.0))
                .flex()
                .flex_col()
                .gap(px(16.0))
                // Patterns section
                .when(!patterns.is_empty(), |el: Div| {
                    el.child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(8.0))
                            .child(
                                div()
                                    .text_sm()
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(theme.text_muted)
                                    .child("Requested patterns:"),
                            )
                            .child(
                                div()
                                    .p(px(12.0))
                                    .rounded(px(8.0))
                                    .bg(theme.background_element)
                                    .border_1()
                                    .border_color(theme.border_subtle)
                                    .flex()
                                    .flex_col()
                                    .gap(px(4.0))
                                    .children(patterns.iter().map(|pattern| {
                                        div()
                                            .text_sm()
                                            .font_family("monospace")
                                            .child(pattern.clone())
                                    })),
                            ),
                    )
                })
                // Metadata section
                .when(metadata_display.is_some(), |el: Div| {
                    let meta = metadata_display.clone().unwrap_or_default();
                    el.child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(8.0))
                            .child(
                                div()
                                    .text_sm()
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(theme.text_muted)
                                    .child("Details:"),
                            )
                            .child(
                                div()
                                    .p(px(12.0))
                                    .rounded(px(8.0))
                                    .bg(theme.background_element)
                                    .border_1()
                                    .border_color(theme.border_subtle)
                                    .text_sm()
                                    .font_family("monospace")
                                    .child(meta),
                            ),
                    )
                })
                // Tool info
                .when(tool_info.is_some(), |el: Div| {
                    el.child(
                        div()
                            .text_xs()
                            .text_color(theme.text_muted)
                            .child(format!("Call ID: {}", tool_info.clone().unwrap_or_default())),
                    )
                }),
        )
        // Actions
        .child(
            div()
                .px(px(20.0))
                .py(px(16.0))
                .border_t_1()
                .border_color(theme.border)
                .flex()
                .items_center()
                .justify_between()
                // Left: Always options
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(8.0))
                        .when(!always_options.is_empty(), |el: Div| {
                            el.child(
                                create_action_button(
                                    "always-allow",
                                    "Always Allow",
                                    theme.background_element,
                                    theme.text,
                                    request_id_always,
                                    PermissionDecision::Always,
                                    theme,
                                    cx,
                                ),
                            )
                        }),
                )
                // Right: Allow/Deny
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(8.0))
                        .child(create_action_button(
                            "deny",
                            "Deny",
                            theme.background_element,
                            theme.text,
                            request_id_deny,
                            PermissionDecision::Reject,
                            theme,
                            cx,
                        ))
                        .child(create_action_button(
                            "allow",
                            "Allow",
                            theme.primary,
                            theme.background,
                            request_id_allow,
                            PermissionDecision::Allow,
                            theme,
                            cx,
                        )),
                ),
        )
}

fn create_action_button(
    id: &str,
    label: &str,
    bg_color: Hsla,
    text_color: Hsla,
    request_id: String,
    decision: PermissionDecision,
    _theme: &Theme,
    _cx: &mut App,
) -> impl IntoElement {
    let label = label.to_string();

    div()
        .id(SharedString::from(format!("permission-{}", id)))
        .px(px(16.0))
        .py(px(8.0))
        .rounded(px(6.0))
        .bg(bg_color)
        .text_color(text_color)
        .text_sm()
        .font_weight(FontWeight::MEDIUM)
        .cursor_pointer()
        .hover(|s| s.opacity(0.9))
        .on_click({
            move |_event, _window, cx| {
                send_permission_reply(request_id.clone(), decision.clone(), cx);
            }
        })
        .child(label)
}

fn send_permission_reply(request_id: String, decision: PermissionDecision, cx: &mut App) {
    let api_state = cx.global::<ApiState>();
    let client = api_state.client.clone();
    let runtime = api_state.runtime.clone();

    let request = PermissionReplyRequest {
        request_id,
        decision,
    };

    // Fire and forget - the event stream will handle the reply event
    let _ = runtime.spawn(async move {
        if let Err(e) = client.reply_permission(request).await {
            tracing::error!("Failed to reply to permission: {}", e);
        }
    });
}

fn format_metadata(metadata: &serde_json::Value) -> Option<String> {
    if metadata.is_null() || (metadata.is_object() && metadata.as_object().map(|o| o.is_empty()).unwrap_or(true)) {
        return None;
    }

    // Try to format nicely
    serde_json::to_string_pretty(metadata).ok()
}
