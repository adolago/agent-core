//! Main application state and root view
//!
//! AppRoot is the top-level view that contains the shell, sidebar, and main content.

use gpui::prelude::*;
use gpui::*;
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use crate::api::ApiState;
use crate::components::sidebar::Sidebar;
use crate::dialogs::permission_prompt::render_permission_prompt;
use crate::dialogs::question_prompt::{render_question_prompt, QuestionState};
use crate::state::{ActiveView, AppState, ConfirmAction, DialogType, Persona};
use crate::theme::Theme;
use crate::views::chat::ChatView;
use crate::views::sessions::SessionsView;
use crate::views::settings::SettingsView;

// ============================================================================
// Root View
// ============================================================================

/// Root view of the application
pub struct AppRoot {
    sessions_view: Entity<SessionsView>,
    chat_view: Entity<ChatView>,
    settings_view: Entity<SettingsView>,
    /// Question state for each question request ID
    question_states: HashMap<String, Rc<RefCell<QuestionState>>>,
}

impl AppRoot {
    pub fn new(cx: &mut Context<Self>) -> Self {
        let sessions_view = cx.new(|cx| SessionsView::new(cx));
        let chat_view = cx.new(|cx| ChatView::new(cx));
        let settings_view = cx.new(|cx| SettingsView::new(cx));

        // Start async tasks for initial data loading
        Self::start_background_tasks(cx);

        Self {
            sessions_view,
            chat_view,
            settings_view,
            question_states: HashMap::new(),
        }
    }

    fn start_background_tasks(cx: &mut Context<Self>) {
        // Get client and runtime references
        let api_state = cx.global::<ApiState>();
        let client = api_state.client.clone();
        let runtime = api_state.runtime.clone();

        // Check daemon health and load initial data
        cx.spawn(async move |_this, cx| {
            // Give the app a moment to initialize
            cx.background_executor().timer(std::time::Duration::from_millis(100)).await;

            // Check health using Tokio runtime
            let client_health = client.clone();
            let healthy = runtime.spawn(async move {
                client_health.health().await.unwrap_or(false)
            }).await.unwrap_or(false);

            let _ = cx.update(|cx| {
                let state = cx.global_mut::<AppState>();
                state.set_connected(healthy);
            });

            if healthy {
                // Load sessions
                let client_sessions = client.clone();
                let runtime_sessions = runtime.clone();
                if let Ok(sessions) = runtime_sessions.spawn(async move {
                    client_sessions.list_sessions().await
                }).await.unwrap_or(Err(anyhow::anyhow!("spawn failed"))) {
                    let _ = cx.update(|cx| {
                        let state = cx.global_mut::<AppState>();
                        state.set_sessions(sessions);
                    });
                }

                // Load providers
                let client_providers = client.clone();
                let runtime_providers = runtime.clone();
                if let Ok(providers) = runtime_providers.spawn(async move {
                    client_providers.list_providers().await
                }).await.unwrap_or(Err(anyhow::anyhow!("spawn failed"))) {
                    let _ = cx.update(|cx| {
                        let state = cx.global_mut::<AppState>();
                        state.set_providers(providers);
                    });
                }

                // Load models
                let client_models = client.clone();
                if let Ok(models) = runtime.spawn(async move {
                    client_models.list_models().await
                }).await.unwrap_or(Err(anyhow::anyhow!("spawn failed"))) {
                    let _ = cx.update(|cx| {
                        let state = cx.global_mut::<AppState>();
                        state.set_models(models);
                    });
                }
            }
        }).detach();
    }

    pub fn set_view(&mut self, view: ActiveView, cx: &mut Context<Self>) {
        let state = cx.global_mut::<AppState>();
        state.set_view(view);
        cx.notify();
    }

    pub fn set_persona(&mut self, persona: Persona, cx: &mut Context<Self>) {
        let state = cx.global_mut::<AppState>();
        state.set_persona(persona);
        cx.notify();
    }

    pub fn toggle_sidebar(&mut self, cx: &mut Context<Self>) {
        let state = cx.global_mut::<AppState>();
        state.toggle_sidebar();
        cx.notify();
    }

    pub fn set_session(&mut self, session_id: Option<String>, cx: &mut Context<Self>) {
        let state = cx.global_mut::<AppState>();
        state.set_active_session(session_id.clone());

        // Load messages for the session if we have one
        if let Some(id) = session_id {
            self.load_session_messages(&id, cx);
        }

        cx.notify();
    }

    fn load_session_messages(&self, session_id: &str, cx: &mut Context<Self>) {
        let session_id = session_id.to_string();
        let api_state = cx.global::<ApiState>();
        let client = api_state.client.clone();
        let runtime = api_state.runtime.clone();

        cx.spawn(async move |_this, cx| {
            let session_id_clone = session_id.clone();
            if let Ok(messages) = runtime.spawn(async move {
                client.get_messages(&session_id_clone).await
            }).await.unwrap_or(Err(anyhow::anyhow!("spawn failed"))) {
                let _ = cx.update(|cx| {
                    let state = cx.global_mut::<AppState>();
                    state.set_messages(&session_id, messages);
                });
            }
        }).detach();
    }

    pub fn open_dialog(&mut self, dialog: DialogType, cx: &mut Context<Self>) {
        let state = cx.global_mut::<AppState>();
        state.open_dialog(dialog);
        cx.notify();
    }

    pub fn close_dialog(&mut self, cx: &mut Context<Self>) {
        let state = cx.global_mut::<AppState>();
        state.close_dialog();
        cx.notify();
    }

    fn render_sidebar(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let state = cx.global::<AppState>();
        Sidebar::render_inline(
            state.active_persona,
            state.active_view,
            state.sidebar_collapsed,
            cx,
        )
    }

    fn render_main_content(&self, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let state = cx.global::<AppState>();

        div()
            .flex_1()
            .flex()
            .flex_col()
            .bg(theme.background_panel)
            .child(self.render_header(state, cx))
            .child(self.render_content(state, cx))
    }

    fn render_header(&self, state: &AppState, cx: &Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let persona = state.active_persona;
        let view_name = match state.active_view {
            ActiveView::Sessions => "Sessions",
            ActiveView::Chat => "Chat",
            ActiveView::Settings => "Settings",
        };

        let persona_accent = match persona {
            Persona::Zee => theme.zee_accent,
            Persona::Stanley => theme.stanley_accent,
            Persona::Johny => theme.johny_accent,
        };

        let connection_status = if state.connected {
            ("Connected", theme.success)
        } else if state.connecting {
            ("Connecting...", theme.warning)
        } else {
            ("Disconnected", theme.error)
        };

        div()
            .h(px(48.0))
            .px(px(16.0))
            .flex()
            .items_center()
            .justify_between()
            .border_b_1()
            .border_color(theme.border)
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.0))
                    .child(
                        div()
                            .w(px(8.0))
                            .h(px(8.0))
                            .rounded_full()
                            .bg(persona_accent)
                    )
                    .child(
                        div()
                            .text_lg()
                            .font_weight(FontWeight::BOLD)
                            .child(persona.name())
                    )
                    .child(
                        div()
                            .px(px(8.0))
                            .py(px(2.0))
                            .rounded(px(4.0))
                            .bg(theme.background_element)
                            .text_sm()
                            .text_color(theme.text_muted)
                            .child(view_name)
                    )
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(4.0))
                            .child(
                                div()
                                    .w(px(6.0))
                                    .h(px(6.0))
                                    .rounded_full()
                                    .bg(connection_status.1)
                            )
                            .child(
                                div()
                                    .text_xs()
                                    .text_color(theme.text_muted)
                                    .child(connection_status.0)
                            )
                    )
                    .when(state.selected_model_name().is_some(), |el| {
                        let model_name = state.selected_model_name().unwrap_or_default();
                        el.child(
                            div()
                                .px(px(8.0))
                                .py(px(2.0))
                                .rounded(px(4.0))
                                .bg(theme.background_element)
                                .text_xs()
                                .text_color(theme.text_muted)
                                .child(model_name)
                        )
                    })
            )
    }

    fn render_content(&self, state: &AppState, _cx: &Context<Self>) -> impl IntoElement {
        match state.active_view {
            ActiveView::Sessions => self.sessions_view.clone().into_any_element(),
            ActiveView::Chat => self.chat_view.clone().into_any_element(),
            ActiveView::Settings => self.settings_view.clone().into_any_element(),
        }
    }

    fn render_dialog_overlay(&mut self, cx: &mut Context<Self>) -> Option<impl IntoElement> {
        let state = cx.global::<AppState>();
        let theme = cx.global::<Theme>().clone();

        let dialog = state.current_dialog().cloned();

        dialog.map(|dialog| {
            let dialog_content = match dialog {
                DialogType::ModelPicker => {
                    self.render_model_picker_dialog(&theme, cx).into_any_element()
                }
                DialogType::ProviderConfig => {
                    self.render_provider_dialog(&theme, cx).into_any_element()
                }
                DialogType::Settings => {
                    self.render_settings_dialog(&theme, cx).into_any_element()
                }
                DialogType::CommandPalette => {
                    self.render_command_palette(&theme, cx).into_any_element()
                }
                DialogType::ThemePicker => {
                    self.render_theme_picker(&theme, cx).into_any_element()
                }
                DialogType::SessionRename(ref id) => {
                    self.render_rename_dialog(&theme, id, cx).into_any_element()
                }
                DialogType::Confirm { ref title, ref message, ref confirm_label, ref on_confirm } => {
                    self.render_confirm_dialog(&theme, title, message, confirm_label, on_confirm.clone(), cx).into_any_element()
                }
            };

            // Overlay background with click to close
            div()
                .id("dialog-overlay")
                .absolute()
                .inset_0()
                .bg(Hsla { h: 0.0, s: 0.0, l: 0.0, a: 0.5 })
                .flex()
                .items_center()
                .justify_center()
                .on_click(cx.listener(|this, _event, _window, cx| {
                    this.close_dialog(cx);
                }))
                .child(dialog_content)
        })
    }

    fn render_model_picker_dialog(&self, theme: &Theme, cx: &mut Context<Self>) -> impl IntoElement {
        let state = cx.global::<AppState>();
        let models = state.models.clone();
        let selected_model_id = state.selected_model_id.clone();

        div()
            .w(px(500.0))
            .max_h(px(600.0))
            .bg(theme.background_panel)
            .border_1()
            .border_color(theme.border)
            .rounded(px(12.0))
            .shadow_lg()
            .flex()
            .flex_col()
            .child(
                // Header
                div()
                    .px(px(16.0))
                    .py(px(12.0))
                    .border_b_1()
                    .border_color(theme.border)
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div()
                            .text_lg()
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("Select Model")
                    )
                    .child(
                        div()
                            .id("close-model-dialog")
                            .w(px(28.0))
                            .h(px(28.0))
                            .rounded(px(6.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .hover(|s| s.bg(theme.background_element))
                            .on_click(cx.listener(|this, _event, _window, cx| {
                                this.close_dialog(cx);
                            }))
                            .child("×")
                    )
            )
            .child(
                // Search input placeholder
                div()
                    .px(px(12.0))
                    .py(px(8.0))
                    .child(
                        div()
                            .px(px(12.0))
                            .py(px(8.0))
                            .rounded(px(6.0))
                            .bg(theme.background_element)
                            .border_1()
                            .border_color(theme.border)
                            .text_color(theme.text_muted)
                            .child("Search models...")
                    )
            )
            .child(
                // Model list
                div()
                    .flex_1()
                    .flex().flex_col()
                    .p(px(8.0))
                    .children(models.into_iter().map(|model| {
                        let model_id = model.id.clone();
                        let provider_id = model.provider_id.clone();
                        let is_selected = selected_model_id.as_ref() == Some(&model_id);

                        div()
                            .id(SharedString::from(format!("model-{}", model.id)))
                            .px(px(12.0))
                            .py(px(10.0))
                            .rounded(px(6.0))
                            .cursor_pointer()
                            .bg(if is_selected { theme.primary.opacity(0.15) } else { Hsla::transparent_black() })
                            .border_1()
                            .border_color(if is_selected { theme.primary } else { Hsla::transparent_black() })
                            .hover(|s| s.bg(theme.background_element))
                            .on_click(cx.listener(move |this, _event, _window, cx| {
                                let state = cx.global_mut::<AppState>();
                                state.select_model(&provider_id, &model_id);
                                this.close_dialog(cx);
                            }))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .child(
                                        div()
                                            .flex()
                                            .flex_col()
                                            .gap(px(2.0))
                                            .child(
                                                div()
                                                    .font_weight(FontWeight::MEDIUM)
                                                    .child(model.name.clone())
                                            )
                                            .child(
                                                div()
                                                    .text_xs()
                                                    .text_color(theme.text_muted)
                                                    .child(model.provider_id.clone())
                                            )
                                    )
                                    .when(is_selected, |el| {
                                        el.child(
                                            div()
                                                .text_color(theme.primary)
                                                .child("✓")
                                        )
                                    })
                            )
                    }))
            )
    }

    fn render_provider_dialog(&self, theme: &Theme, cx: &mut Context<Self>) -> impl IntoElement {
        let state = cx.global::<AppState>();
        let providers = state.providers.clone();

        div()
            .w(px(500.0))
            .max_h(px(600.0))
            .bg(theme.background_panel)
            .border_1()
            .border_color(theme.border)
            .rounded(px(12.0))
            .shadow_lg()
            .flex()
            .flex_col()
            .child(
                div()
                    .px(px(16.0))
                    .py(px(12.0))
                    .border_b_1()
                    .border_color(theme.border)
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div()
                            .text_lg()
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("Configure Providers")
                    )
                    .child(
                        div()
                            .id("close-provider-dialog")
                            .w(px(28.0))
                            .h(px(28.0))
                            .rounded(px(6.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .hover(|s| s.bg(theme.background_element))
                            .on_click(cx.listener(|this, _event, _window, cx| {
                                this.close_dialog(cx);
                            }))
                            .child("×")
                    )
            )
            .child(
                div()
                    .flex_1()
                    .flex().flex_col()
                    .p(px(12.0))
                    .children(
                        if providers.is_empty() {
                            vec![
                                div()
                                    .py(px(24.0))
                                    .text_color(theme.text_muted)
                                    .text_center()
                                    .child("No providers available. Start the daemon to load providers.")
                                    .into_any_element()
                            ]
                        } else {
                            providers.iter().map(|provider| {
                                let status_color = if provider.has_api_key {
                                    theme.success
                                } else {
                                    theme.text_muted
                                };

                                div()
                                    .px(px(12.0))
                                    .py(px(12.0))
                                    .rounded(px(8.0))
                                    .border_1()
                                    .border_color(theme.border_subtle)
                                    .bg(theme.background_element)
                                    .mb(px(8.0))
                                    .child(
                                        div()
                                            .flex()
                                            .items_center()
                                            .justify_between()
                                            .child(
                                                div()
                                                    .flex()
                                                    .items_center()
                                                    .gap(px(12.0))
                                                    .child(
                                                        div()
                                                            .w(px(8.0))
                                                            .h(px(8.0))
                                                            .rounded_full()
                                                            .bg(status_color)
                                                    )
                                                    .child(
                                                        div()
                                                            .flex()
                                                            .flex_col()
                                                            .gap(px(2.0))
                                                            .child(
                                                                div()
                                                                    .font_weight(FontWeight::MEDIUM)
                                                                    .child(provider.name.clone())
                                                            )
                                                            .child(
                                                                div()
                                                                    .text_xs()
                                                                    .text_color(theme.text_muted)
                                                                    .child(if provider.has_api_key { "API key configured" } else { "Not configured" })
                                                            )
                                                    )
                                            )
                                            .child(
                                                div()
                                                    .id(SharedString::from(format!("provider-{}", provider.id)))
                                                    .px(px(12.0))
                                                    .py(px(6.0))
                                                    .rounded(px(6.0))
                                                    .bg(theme.background)
                                                    .border_1()
                                                    .border_color(theme.border)
                                                    .text_sm()
                                                    .cursor_pointer()
                                                    .hover(|s| s.bg(theme.background_panel))
                                                    .child(if provider.has_api_key { "Edit Key" } else { "Add Key" })
                                            )
                                    )
                                    .into_any_element()
                            }).collect()
                        }
                    )
            )
    }

    fn render_settings_dialog(&self, theme: &Theme, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .w(px(600.0))
            .h(px(500.0))
            .bg(theme.background_panel)
            .border_1()
            .border_color(theme.border)
            .rounded(px(12.0))
            .shadow_lg()
            .flex()
            .flex_col()
            .child(
                div()
                    .px(px(16.0))
                    .py(px(12.0))
                    .border_b_1()
                    .border_color(theme.border)
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div()
                            .text_lg()
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("Settings")
                    )
                    .child(
                        div()
                            .id("close-settings-dialog")
                            .w(px(28.0))
                            .h(px(28.0))
                            .rounded(px(6.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .hover(|s| s.bg(theme.background_element))
                            .on_click(cx.listener(|this, _event, _window, cx| {
                                this.close_dialog(cx);
                            }))
                            .child("×")
                    )
            )
            .child(
                div()
                    .flex_1()
                    .p(px(16.0))
                    .flex()
                    .flex_col()
                    .items_center()
                    .justify_center()
                    .gap(px(12.0))
                    .child(
                        div()
                            .text_color(theme.text_muted)
                            .child("Use the Settings view for full configuration options")
                    )
                    .child(
                        div()
                            .id("go-to-settings")
                            .px(px(16.0))
                            .py(px(8.0))
                            .rounded(px(6.0))
                            .bg(theme.primary)
                            .text_color(theme.background)
                            .cursor_pointer()
                            .hover(|s| s.opacity(0.9))
                            .on_click(cx.listener(|this, _event, _window, cx| {
                                this.set_view(ActiveView::Settings, cx);
                                this.close_dialog(cx);
                            }))
                            .child("Go to Settings")
                    )
            )
    }

    fn render_command_palette(&self, theme: &Theme, cx: &mut Context<Self>) -> impl IntoElement {
        // Define commands
        let commands = vec![
            ("New Session", "Create a new chat session", "new-session"),
            ("Select Model", "Choose an AI model", "model-picker"),
            ("Select Theme", "Change the color theme", "theme-picker"),
            ("Configure Providers", "Manage API keys", "provider-config"),
            ("Go to Sessions", "View all sessions", "view-sessions"),
            ("Go to Chat", "Open chat view", "view-chat"),
            ("Go to Settings", "Open settings", "view-settings"),
            ("Toggle Sidebar", "Collapse or expand sidebar", "toggle-sidebar"),
        ];

        div()
            .w(px(600.0))
            .max_h(px(450.0))
            .bg(theme.background_panel)
            .border_1()
            .border_color(theme.border)
            .rounded(px(12.0))
            .shadow_lg()
            .flex()
            .flex_col()
            .child(
                div()
                    .px(px(12.0))
                    .py(px(12.0))
                    .border_b_1()
                    .border_color(theme.border)
                    .child(
                        div()
                            .px(px(12.0))
                            .py(px(10.0))
                            .rounded(px(8.0))
                            .bg(theme.background_element)
                            .border_1()
                            .border_color(theme.border)
                            .text_color(theme.text_muted)
                            .child("Type a command...")
                    )
            )
            .child(
                div()
                    .flex_1()
                    .flex().flex_col()
                    .p(px(8.0))
                    .children(commands.iter().map(|(name, desc, action)| {
                        let action = *action;
                        div()
                            .id(SharedString::from(format!("cmd-{}", action)))
                            .px(px(12.0))
                            .py(px(10.0))
                            .rounded(px(6.0))
                            .cursor_pointer()
                            .hover(|s| s.bg(theme.background_element))
                            .on_click(cx.listener(move |this, _event, _window, cx| {
                                match action {
                                    "new-session" => {
                                        // Create new session would go here
                                    }
                                    "model-picker" => {
                                        this.close_dialog(cx);
                                        this.open_dialog(DialogType::ModelPicker, cx);
                                    }
                                    "theme-picker" => {
                                        this.close_dialog(cx);
                                        this.open_dialog(DialogType::ThemePicker, cx);
                                    }
                                    "provider-config" => {
                                        this.close_dialog(cx);
                                        this.open_dialog(DialogType::ProviderConfig, cx);
                                    }
                                    "view-sessions" => {
                                        this.set_view(ActiveView::Sessions, cx);
                                        this.close_dialog(cx);
                                    }
                                    "view-chat" => {
                                        this.set_view(ActiveView::Chat, cx);
                                        this.close_dialog(cx);
                                    }
                                    "view-settings" => {
                                        this.set_view(ActiveView::Settings, cx);
                                        this.close_dialog(cx);
                                    }
                                    "toggle-sidebar" => {
                                        this.toggle_sidebar(cx);
                                        this.close_dialog(cx);
                                    }
                                    _ => {}
                                }
                            }))
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .gap(px(2.0))
                                    .child(
                                        div()
                                            .font_weight(FontWeight::MEDIUM)
                                            .child(*name)
                                    )
                                    .child(
                                        div()
                                            .text_xs()
                                            .text_color(theme.text_muted)
                                            .child(*desc)
                                    )
                            )
                    }))
            )
    }

    fn render_theme_picker(&self, theme: &Theme, cx: &mut Context<Self>) -> impl IntoElement {
        let registry = cx.global::<crate::theme::ThemeRegistry>();
        let state = cx.global::<AppState>();
        let current_theme_id = state.current_theme_id.clone();
        let dark_themes: Vec<_> = registry.dark_themes().into_iter().cloned().collect();
        let light_themes: Vec<_> = registry.light_themes().into_iter().cloned().collect();

        div()
            .w(px(500.0))
            .max_h(px(600.0))
            .bg(theme.background_panel)
            .border_1()
            .border_color(theme.border)
            .rounded(px(12.0))
            .shadow_lg()
            .flex()
            .flex_col()
            .child(
                div()
                    .px(px(16.0))
                    .py(px(12.0))
                    .border_b_1()
                    .border_color(theme.border)
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div()
                            .text_lg()
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("Select Theme")
                    )
                    .child(
                        div()
                            .id("close-theme-dialog")
                            .w(px(28.0))
                            .h(px(28.0))
                            .rounded(px(6.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .hover(|s| s.bg(theme.background_element))
                            .on_click(cx.listener(|this, _event, _window, cx| {
                                this.close_dialog(cx);
                            }))
                            .child("×")
                    )
            )
            .child(
                // Dark themes section
                div()
                    .px(px(12.0))
                    .pt(px(12.0))
                    .pb(px(4.0))
                    .text_xs()
                    .text_color(theme.text_muted)
                    .font_weight(FontWeight::MEDIUM)
                    .child("DARK THEMES")
            )
            .child(
                div()
                    .flex().flex_col()
                    .px(px(8.0))
                    .children(dark_themes.iter().map(|t| {
                        let theme_id = t.id;
                        let is_current = theme_id == current_theme_id.as_str();
                        div()
                            .id(SharedString::from(format!("theme-{}", t.id)))
                            .px(px(12.0))
                            .py(px(10.0))
                            .rounded(px(6.0))
                            .cursor_pointer()
                            .bg(if is_current { theme.primary.opacity(0.15) } else { Hsla::transparent_black() })
                            .hover(|s| s.bg(theme.background_element))
                            .on_click(cx.listener(move |this, _event, _window, cx| {
                                crate::theme::set_theme_by_id(theme_id, cx);
                                let state = cx.global_mut::<AppState>();
                                state.set_theme(theme_id.to_string());
                                this.close_dialog(cx);
                            }))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .child(
                                        div()
                                            .font_weight(if is_current { FontWeight::MEDIUM } else { FontWeight::NORMAL })
                                            .child(t.name)
                                    )
                                    .when(is_current, |el| {
                                        el.child(
                                            div()
                                                .text_color(theme.primary)
                                                .child("✓")
                                        )
                                    })
                            )
                    }))
            )
            .child(
                // Light themes section
                div()
                    .px(px(12.0))
                    .pt(px(12.0))
                    .pb(px(4.0))
                    .text_xs()
                    .text_color(theme.text_muted)
                    .font_weight(FontWeight::MEDIUM)
                    .child("LIGHT THEMES")
            )
            .child(
                div()
                    .flex().flex_col()
                    .px(px(8.0))
                    .pb(px(8.0))
                    .children(light_themes.iter().map(|t| {
                        let theme_id = t.id;
                        let is_current = theme_id == current_theme_id.as_str();
                        div()
                            .id(SharedString::from(format!("theme-{}", t.id)))
                            .px(px(12.0))
                            .py(px(10.0))
                            .rounded(px(6.0))
                            .cursor_pointer()
                            .bg(if is_current { theme.primary.opacity(0.15) } else { Hsla::transparent_black() })
                            .hover(|s| s.bg(theme.background_element))
                            .on_click(cx.listener(move |this, _event, _window, cx| {
                                crate::theme::set_theme_by_id(theme_id, cx);
                                let state = cx.global_mut::<AppState>();
                                state.set_theme(theme_id.to_string());
                                this.close_dialog(cx);
                            }))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .child(
                                        div()
                                            .font_weight(if is_current { FontWeight::MEDIUM } else { FontWeight::NORMAL })
                                            .child(t.name)
                                    )
                                    .when(is_current, |el| {
                                        el.child(
                                            div()
                                                .text_color(theme.primary)
                                                .child("✓")
                                        )
                                    })
                            )
                    }))
            )
    }

    fn render_rename_dialog(&self, theme: &Theme, session_id: &str, cx: &mut Context<Self>) -> impl IntoElement {
        let state = cx.global::<AppState>();
        let current_title = state.sessions.iter()
            .find(|s| s.id == session_id)
            .and_then(|s| s.title.clone())
            .unwrap_or_else(|| "Untitled Session".to_string());

        div()
            .w(px(420.0))
            .bg(theme.background_panel)
            .border_1()
            .border_color(theme.border)
            .rounded(px(12.0))
            .shadow_lg()
            .p(px(20.0))
            .flex()
            .flex_col()
            .gap(px(16.0))
            .child(
                div()
                    .text_lg()
                    .font_weight(FontWeight::SEMIBOLD)
                    .child("Rename Session")
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(8.0))
                    .child(
                        div()
                            .text_sm()
                            .text_color(theme.text_muted)
                            .child("Session Title")
                    )
                    .child(
                        div()
                            .w_full()
                            .px(px(12.0))
                            .py(px(10.0))
                            .rounded(px(8.0))
                            .bg(theme.background_element)
                            .border_1()
                            .border_color(theme.border)
                            .child(current_title)
                    )
            )
            .child(
                div()
                    .flex()
                    .justify_end()
                    .gap(px(8.0))
                    .child(
                        div()
                            .id("cancel-rename")
                            .px(px(16.0))
                            .py(px(8.0))
                            .rounded(px(6.0))
                            .bg(theme.background_element)
                            .cursor_pointer()
                            .hover(|s| s.opacity(0.8))
                            .on_click(cx.listener(|this, _event, _window, cx| {
                                this.close_dialog(cx);
                            }))
                            .child("Cancel")
                    )
                    .child(
                        div()
                            .id("save-rename")
                            .px(px(16.0))
                            .py(px(8.0))
                            .rounded(px(6.0))
                            .bg(theme.primary)
                            .text_color(theme.background)
                            .cursor_pointer()
                            .hover(|s| s.opacity(0.9))
                            .on_click(cx.listener(|this, _event, _window, cx| {
                                // TODO: Actually save the new title via API
                                this.close_dialog(cx);
                            }))
                            .child("Save")
                    )
            )
    }

    fn render_confirm_dialog(&self, theme: &Theme, title: &str, message: &str, confirm_label: &str, on_confirm: ConfirmAction, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .w(px(420.0))
            .bg(theme.background_panel)
            .border_1()
            .border_color(theme.border)
            .rounded(px(12.0))
            .shadow_lg()
            .p(px(20.0))
            .flex()
            .flex_col()
            .gap(px(16.0))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.0))
                    .child(
                        div()
                            .w(px(40.0))
                            .h(px(40.0))
                            .rounded_full()
                            .bg(theme.error.opacity(0.15))
                            .flex()
                            .items_center()
                            .justify_center()
                            .child(
                                div()
                                    .text_lg()
                                    .text_color(theme.error)
                                    .child("!")
                            )
                    )
                    .child(
                        div()
                            .text_lg()
                            .font_weight(FontWeight::SEMIBOLD)
                            .child(title.to_string())
                    )
            )
            .child(
                div()
                    .text_color(theme.text_muted)
                    .child(message.to_string())
            )
            .child(
                div()
                    .flex()
                    .justify_end()
                    .gap(px(8.0))
                    .child(
                        div()
                            .id("cancel-confirm")
                            .px(px(16.0))
                            .py(px(8.0))
                            .rounded(px(6.0))
                            .bg(theme.background_element)
                            .cursor_pointer()
                            .hover(|s| s.opacity(0.8))
                            .on_click(cx.listener(|this, _event, _window, cx| {
                                this.close_dialog(cx);
                            }))
                            .child("Cancel")
                    )
                    .child(
                        div()
                            .id("confirm-action")
                            .px(px(16.0))
                            .py(px(8.0))
                            .rounded(px(6.0))
                            .bg(theme.error)
                            .text_color(theme.background)
                            .cursor_pointer()
                            .hover(|s| s.opacity(0.9))
                            .on_click(cx.listener(move |this, _event, _window, cx| {
                                match &on_confirm {
                                    ConfirmAction::DeleteSession(session_id) => {
                                        let state = cx.global_mut::<AppState>();
                                        state.remove_session(session_id);
                                    }
                                    ConfirmAction::ClearChat(session_id) => {
                                        let state = cx.global_mut::<AppState>();
                                        state.set_messages(session_id, vec![]);
                                    }
                                }
                                this.close_dialog(cx);
                            }))
                            .child(confirm_label.to_string())
                    )
            )
    }
}

impl Render for AppRoot {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>().clone();
        let state = cx.global::<AppState>();
        let has_dialog = state.has_dialog();

        // Get active session ID for prompt checking
        let active_session_id = state.active_session_id.clone();

        // Check for pending prompts (permissions take priority)
        let pending_permission = active_session_id
            .as_ref()
            .and_then(|sid| state.get_next_permission(sid))
            .cloned();
        let pending_question = if pending_permission.is_none() {
            active_session_id
                .as_ref()
                .and_then(|sid| state.get_next_question(sid))
                .cloned()
        } else {
            None
        };

        let sidebar = self.render_sidebar(cx);
        let main_content = self.render_main_content(cx);

        let mut root = div()
            .flex()
            .flex_row()
            .size_full()
            .bg(theme.background)
            .text_color(theme.text)
            .child(sidebar)
            .child(main_content);

        // Add dialog overlay if needed (lowest priority)
        if has_dialog && pending_permission.is_none() && pending_question.is_none() {
            if let Some(overlay) = self.render_dialog_overlay(cx) {
                root = root.child(overlay);
            }
        }

        // Add question prompt overlay (medium priority)
        if let Some(question) = pending_question {
            // Get or create question state
            let state = self
                .question_states
                .entry(question.id.clone())
                .or_insert_with(|| Rc::new(RefCell::new(QuestionState::new(&question.questions))))
                .clone();

            root = root.child(render_question_prompt(&question, state, &theme, cx));
        }

        // Add permission prompt overlay (highest priority)
        if let Some(permission) = pending_permission {
            root = root.child(render_permission_prompt(&permission, &theme, cx));
        }

        root
    }
}
