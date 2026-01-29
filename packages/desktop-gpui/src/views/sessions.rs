//! Sessions list view
//!
//! Displays a list of all sessions and allows creating new ones.

use gpui::prelude::*;
use gpui::*;
use crate::api::{types::CreateSessionRequest, ApiState};
use crate::i18n::I18n;
use crate::state::AppState;
use crate::theme::Theme;

/// Sessions list view
pub struct SessionsView {
    search_query: String,
    selected_index: Option<usize>,
}

impl SessionsView {
    pub fn new(_cx: &mut Context<Self>) -> Self {
        Self {
            search_query: String::new(),
            selected_index: None,
        }
    }

    fn create_new_session(&self, cx: &mut Context<Self>) {
        let api_state = cx.global::<ApiState>();
        let client = api_state.client.clone();
        let runtime = api_state.runtime.clone();
        let agent_name = cx.global::<AppState>().active_persona.agent_name().to_string();

        cx.spawn(async move |_this, cx| {
            let request = CreateSessionRequest {
                title: None,
                agent: Some(agent_name),
                model: None,
            };

            if let Ok(session) = runtime.spawn(async move {
                client.create_session(request).await
            }).await.unwrap_or(Err(anyhow::anyhow!("spawn failed"))) {
                let _ = cx.update(|cx| {
                    let state = cx.global_mut::<AppState>();
                    state.add_session(session.clone());
                    state.set_active_session(Some(session.id));
                });
            }
        }).detach();
    }

    fn select_session(&mut self, session_id: &str, cx: &mut Context<Self>) {
        cx.update_global::<AppState, _>(|state, _cx| {
            state.set_active_session(Some(session_id.to_string()));
        });
        cx.notify();
    }

    fn render_header(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let i18n = cx.global::<I18n>();

        div()
            .flex()
            .items_center()
            .justify_between()
            .mb(px(16.0))
            .child(
                div()
                    .text_xl()
                    .font_weight(FontWeight::BOLD)
                    .child(i18n.t("sessions.title"))
            )
            .child(
                div()
                    .id("new-session-btn")
                    .px(px(12.0))
                    .py(px(6.0))
                    .rounded(px(6.0))
                    .bg(theme.primary)
                    .text_color(theme.background)
                    .font_weight(FontWeight::MEDIUM)
                    .cursor_pointer()
                    .hover(|s| s.opacity(0.9))
                    .on_click(cx.listener(|this, _event, _window, cx| {
                        this.create_new_session(cx);
                    }))
                    .child(format!("+ {}", i18n.t("sessions.new")))
            )
    }

    fn render_search(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let i18n = cx.global::<I18n>();

        div()
            .mb(px(16.0))
            .child(
                div()
                    .w_full()
                    .px(px(12.0))
                    .py(px(8.0))
                    .rounded(px(8.0))
                    .bg(theme.background_element)
                    .border_1()
                    .border_color(theme.border)
                    .child(
                        if self.search_query.is_empty() {
                            div()
                                .text_color(theme.text_muted)
                                .child(i18n.t("sessions.search_placeholder"))
                        } else {
                            div().child(self.search_query.clone())
                        }
                    )
            )
    }

    fn render_sessions_list(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let state = cx.global::<AppState>();
        let theme = cx.global::<Theme>();
        let i18n = cx.global::<I18n>();

        if state.sessions_loading {
            return div()
                .flex_1()
                .flex()
                .items_center()
                .justify_center()
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .items_center()
                        .gap(px(8.0))
                        .child(
                            // Simple loading spinner
                            div()
                                .w(px(24.0))
                                .h(px(24.0))
                                .rounded_full()
                                .border_2()
                                .border_color(theme.primary.opacity(0.3))
                                .border_color(theme.primary)
                        )
                        .child(
                            div()
                                .text_color(theme.text_muted)
                                .child(i18n.t("sessions.loading"))
                        )
                )
                .into_any_element();
        }

        let sessions = state.filtered_sessions();

        if sessions.is_empty() {
            return div()
                .flex_1()
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .gap(px(12.0))
                .child(
                    div()
                        .w(px(64.0))
                        .h(px(64.0))
                        .rounded(px(12.0))
                        .bg(theme.background_element)
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            div()
                                .text_2xl()
                                .text_color(theme.text_muted)
                                .child(i18n.t("sessions.empty_icon"))
                        )
                )
                .child(
                    div()
                        .text_lg()
                        .text_color(theme.text_muted)
                        .child(i18n.t("sessions.empty_title"))
                )
                .child(
                    div()
                        .text_sm()
                        .text_color(theme.text_muted)
                        .child(i18n.t("sessions.empty_subtitle"))
                )
                .into_any_element();
        }

        div()
            .flex()
            .flex_col()
            .gap(px(8.0))
            .flex().flex_col()
            .children(
                sessions
                    .iter()
                    .enumerate()
                    .map(|(index, session)| {
                        let session_id = session.id.clone();
                        let is_selected = state.active_session_id.as_ref() == Some(&session_id);
                        let title = session.title.clone().unwrap_or_else(|| i18n.t("sessions.untitled"));
                        let message_count = session.message_count;
                        let created_at = format_timestamp(session.created_at);

                        let bg = if is_selected {
                            theme.primary.opacity(0.15)
                        } else {
                            theme.background_element
                        };

                        let border_color = if is_selected {
                            theme.primary
                        } else {
                            theme.border_subtle
                        };

                        let session_id_for_click = session_id.clone();
                        div()
                            .id(SharedString::from(format!("session-{}", index)))
                            .px(px(14.0))
                            .py(px(12.0))
                            .rounded(px(8.0))
                            .bg(bg)
                            .border_1()
                            .border_color(border_color)
                            .cursor_pointer()
                            .hover(|style| style.bg(theme.background_element).border_color(theme.border_active))
                            .on_click(cx.listener(move |this, _event, _window, cx| {
                                this.select_session(&session_id_for_click, cx);
                            }))
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .gap(px(4.0))
                                    .child(
                                        div()
                                            .flex()
                                            .items_center()
                                            .justify_between()
                                            .child(
                                                div()
                                                    .font_weight(FontWeight::MEDIUM)
                                                    .text_ellipsis()
                                                    .child(title)
                                            )
                                            .child(
                                                div()
                                                    .text_xs()
                                                    .text_color(theme.text_muted)
                                                    .child(created_at)
                                            )
                                    )
                                    .child(
                                        div()
                                            .flex()
                                            .items_center()
                                            .gap(px(8.0))
                                            .child(
                                                div()
                                                    .text_xs()
                                                    .text_color(theme.text_muted)
                                                    .child(format!("{} messages", message_count))
                                            )
                                            .when(session.agent.is_some(), |el| {
                                                let agent = session.agent.as_ref().unwrap();
                                                el.child(
                                                    div()
                                                        .px(px(6.0))
                                                        .py(px(2.0))
                                                        .rounded(px(4.0))
                                                        .bg(theme.background)
                                                        .text_xs()
                                                        .text_color(theme.text_muted)
                                                        .child(agent.clone())
                                                )
                                            })
                                    )
                            )
                    })
            )
            .into_any_element()
    }
}

impl Render for SessionsView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();

        div()
            .flex()
            .flex_col()
            .flex_1()
            .p(px(20.0))
            .bg(theme.background_panel)
            .child(self.render_header(cx))
            .child(self.render_search(cx))
            .child(self.render_sessions_list(cx))
    }
}

/// Format a Unix timestamp to a relative or absolute string
fn format_timestamp(timestamp: i64) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let diff = now - timestamp;

    if diff < 60 {
        "Just now".to_string()
    } else if diff < 3600 {
        format!("{}m ago", diff / 60)
    } else if diff < 86400 {
        format!("{}h ago", diff / 3600)
    } else if diff < 604800 {
        format!("{}d ago", diff / 86400)
    } else {
        // Format as date
        let datetime = chrono::DateTime::from_timestamp(timestamp, 0)
            .unwrap_or_else(|| chrono::Utc::now());
        datetime.format("%b %d").to_string()
    }
}
