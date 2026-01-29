//! Settings view
//!
//! Allows configuring the application and agent settings.

use gpui::prelude::*;
use gpui::*;
use chrono::{Local, TimeZone};
use crate::api::ApiState;
use crate::i18n::I18n;
use crate::state::AppState;
use crate::theme::{Theme, ThemeRegistry};
use crate::update::{self, UpdateCheck, UpdateStatus};

/// Settings view with tabs
pub struct SettingsView {
    active_tab: SettingsTab,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SettingsTab {
    #[default]
    General,
    Appearance,
    Providers,
    Keyboard,
    About,
}

impl SettingsView {
    pub fn new(_cx: &mut Context<Self>) -> Self {
        Self {
            active_tab: SettingsTab::General,
        }
    }

    fn render_tabs(&self, cx: &Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let i18n = cx.global::<I18n>();

        let tabs = [
            (SettingsTab::General, i18n.t("settings.tabs.general")),
            (SettingsTab::Appearance, i18n.t("settings.tabs.appearance")),
            (SettingsTab::Providers, i18n.t("settings.tabs.providers")),
            (SettingsTab::Keyboard, i18n.t("settings.tabs.keyboard")),
            (SettingsTab::About, i18n.t("settings.tabs.about")),
        ];

        div()
            .flex()
            .gap(px(4.0))
            .mb(px(24.0))
            .children(tabs.iter().map(|(tab, label)| {
                let is_active = self.active_tab == *tab;
                let bg = if is_active {
                    theme.primary.opacity(0.15)
                } else {
                    Hsla::transparent_black()
                };
                let text_color = if is_active {
                    theme.primary
                } else {
                    theme.text_muted
                };

                div()
                    .px(px(16.0))
                    .py(px(8.0))
                    .rounded(px(6.0))
                    .bg(bg)
                    .text_color(text_color)
                    .font_weight(if is_active { FontWeight::MEDIUM } else { FontWeight::NORMAL })
                    .cursor_pointer()
                    .hover(|s| s.bg(theme.background_element))
                    .child(label.clone())
            }))
    }

    fn render_section(&self, title: String, description: Option<String>, cx: &Context<Self>) -> Div {
        let theme = cx.global::<Theme>();

        let section = div()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .p(px(20.0))
            .rounded(px(12.0))
            .bg(theme.background_element)
            .border_1()
            .border_color(theme.border_subtle)
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(4.0))
                    .child(
                        div()
                            .text_lg()
                            .font_weight(FontWeight::SEMIBOLD)
                            .child(title)
                    )
            );

        if let Some(desc) = description {
            section.child(
                div()
                    .text_sm()
                    .text_color(theme.text_muted)
                    .child(desc)
            )
        } else {
            section
        }
    }

    fn render_general_tab(&self, cx: &Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let state = cx.global::<AppState>();
        let i18n = cx.global::<I18n>();

        div()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .child(
                self.render_section(
                    i18n.t("settings.connection.title"),
                    Some(i18n.t("settings.connection.description")),
                    cx,
                )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(div().child(i18n.t("settings.connection.daemon_url")))
                            .child(
                                div()
                                    .px(px(12.0))
                                    .py(px(8.0))
                                    .rounded(px(6.0))
                                    .bg(theme.background)
                                    .border_1()
                                    .border_color(theme.border)
                                    .min_w(px(250.0))
                                    .child(state.daemon_url.clone())
                            )
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(div().child(i18n.t("settings.connection.status")))
                            .child(
                                div()
                                    .flex()
                                    .items_center()
                                    .gap(px(8.0))
                                    .child(
                                        div()
                                            .w(px(8.0))
                                            .h(px(8.0))
                                            .rounded_full()
                                            .bg(if state.connected { theme.success } else { theme.error })
                                    )
                                    .child(
                                        div()
                                            .text_sm()
                                            .child(if state.connected {
                                                i18n.t("status.connected")
                                            } else {
                                                i18n.t("status.disconnected")
                                            })
                                    )
                            )
                    )
            )
            .child(
                self.render_section(
                    i18n.t("settings.persona.title"),
                    Some(i18n.t("settings.persona.description")),
                    cx,
                )
                    .child(
                        div()
                            .flex()
                            .gap(px(8.0))
                            .child(self.render_persona_button(
                                &i18n.t("persona.zee.name"),
                                state.active_persona == crate::state::Persona::Zee,
                                theme.zee_accent,
                                cx,
                            ))
                            .child(self.render_persona_button(
                                &i18n.t("persona.stanley.name"),
                                state.active_persona == crate::state::Persona::Stanley,
                                theme.stanley_accent,
                                cx,
                            ))
                            .child(self.render_persona_button(
                                &i18n.t("persona.johny.name"),
                                state.active_persona == crate::state::Persona::Johny,
                                theme.johny_accent,
                                cx,
                            ))
                    )
            )
    }

    fn render_persona_button(&self, name: &str, is_selected: bool, accent: Hsla, cx: &Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let name_owned = name.to_string();

        div()
            .px(px(16.0))
            .py(px(8.0))
            .rounded(px(8.0))
            .bg(if is_selected { accent.opacity(0.15) } else { theme.background })
            .border_1()
            .border_color(if is_selected { accent } else { theme.border })
            .cursor_pointer()
            .hover(|s| s.bg(accent.opacity(0.1)))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(
                        div()
                            .w(px(8.0))
                            .h(px(8.0))
                            .rounded_full()
                            .bg(accent)
                    )
                    .child(name_owned)
            )
    }

    fn render_appearance_tab(&self, cx: &Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let state = cx.global::<AppState>();
        let registry = cx.global::<ThemeRegistry>();
        let i18n = cx.global::<I18n>();

        div()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .child(
                self.render_section(
                    i18n.t("settings.appearance.title"),
                    Some(i18n.t("settings.appearance.description")),
                    cx,
                )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(div().child(i18n.t("settings.appearance.current")))
                            .child(
                                div()
                                    .px(px(12.0))
                                    .py(px(6.0))
                                    .rounded(px(6.0))
                                    .bg(theme.primary.opacity(0.15))
                                    .text_color(theme.primary)
                                    .font_weight(FontWeight::MEDIUM)
                                    .child(theme.name)
                            )
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
                                    .child(i18n.t("settings.appearance.dark"))
                            )
                            .child(
                                div()
                                    .flex()
                                    .flex_wrap()
                                    .gap(px(8.0))
                                    .children(registry.dark_themes().iter().take(10).map(|t| {
                                        let is_current = t.id == state.current_theme_id;
                                        div()
                                            .px(px(12.0))
                                            .py(px(6.0))
                                            .rounded(px(6.0))
                                            .bg(if is_current { theme.primary.opacity(0.15) } else { theme.background })
                                            .border_1()
                                            .border_color(if is_current { theme.primary } else { theme.border_subtle })
                                            .cursor_pointer()
                                            .hover(|s| s.bg(theme.background_element))
                                            .text_sm()
                                            .child(t.name)
                                    }))
                            )
                            .child(
                                div()
                                    .text_sm()
                                    .text_color(theme.text_muted)
                                    .mt(px(8.0))
                                    .child(i18n.t("settings.appearance.light"))
                            )
                            .child(
                                div()
                                    .flex()
                                    .flex_wrap()
                                    .gap(px(8.0))
                                    .children(registry.light_themes().iter().take(10).map(|t| {
                                        let is_current = t.id == state.current_theme_id;
                                        div()
                                            .px(px(12.0))
                                            .py(px(6.0))
                                            .rounded(px(6.0))
                                            .bg(if is_current { theme.primary.opacity(0.15) } else { theme.background })
                                            .border_1()
                                            .border_color(if is_current { theme.primary } else { theme.border_subtle })
                                            .cursor_pointer()
                                            .hover(|s| s.bg(theme.background_element))
                                            .text_sm()
                                            .child(t.name)
                                    }))
                            )
                    )
            )
            .child(
                self.render_section(i18n.t("settings.appearance.sidebar_title"), None, cx)
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(div().child(i18n.t("settings.appearance.sidebar_collapsed")))
                            .child(
                                div()
                                    .w(px(48.0))
                                    .h(px(24.0))
                                    .rounded_full()
                                    .bg(if state.sidebar_collapsed { theme.primary } else { theme.background_element })
                                    .border_1()
                                    .border_color(theme.border)
                                    .cursor_pointer()
                                    .child(
                                        div()
                                            .w(px(20.0))
                                            .h(px(20.0))
                                            .rounded_full()
                                            .bg(theme.text)
                                            .mt(px(1.0))
                                            .ml(if state.sidebar_collapsed { px(25.0) } else { px(1.0) })
                                    )
                            )
                    )
            )
    }

    fn render_providers_tab(&self, cx: &Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let state = cx.global::<AppState>();
        let i18n = cx.global::<I18n>();

        div()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .child(
                self.render_section(
                    i18n.t("settings.providers.title"),
                    Some(i18n.t("settings.providers.description")),
                    cx,
                )
                    .children(
                        if state.providers.is_empty() {
                            vec![
                                div()
                                    .py(px(12.0))
                                    .text_color(theme.text_muted)
                                    .text_center()
                                    .child(i18n.t("settings.providers.none"))
                                    .into_any_element()
                            ]
                        } else {
                            state.providers.iter().map(|provider| {
                                let has_key = provider.has_api_key;
                                div()
                                    .flex()
                                    .items_center()
                                    .justify_between()
                                    .py(px(12.0))
                                    .border_b_1()
                                    .border_color(theme.border_subtle)
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
                                                    .bg(if has_key { theme.success } else { theme.text_muted })
                                            )
                                            .child(
                                                div()
                                                    .flex()
                                                    .flex_col()
                                                    .child(
                                                        div()
                                                            .font_weight(FontWeight::MEDIUM)
                                                            .child(provider.name.clone())
                                                    )
                                                    .child(
                                                        div()
                                                            .text_xs()
                                                            .text_color(theme.text_muted)
                                                            .child(if has_key {
                                                                i18n.t("dialogs.provider.configured")
                                                            } else {
                                                                i18n.t("dialogs.provider.not_configured")
                                                            })
                                                    )
                                            )
                                    )
                                    .child(
                                        div()
                                            .px(px(12.0))
                                            .py(px(6.0))
                                            .rounded(px(6.0))
                                            .bg(theme.background)
                                            .border_1()
                                            .border_color(theme.border)
                                            .cursor_pointer()
                                            .hover(|s| s.bg(theme.background_element))
                                            .text_sm()
                                            .child(if has_key {
                                                i18n.t("dialogs.provider.edit_key")
                                            } else {
                                                i18n.t("dialogs.provider.add_key")
                                            })
                                    )
                                    .into_any_element()
                            }).collect()
                        }
                    )
            )
            .child(
                self.render_section(
                    i18n.t("settings.models.title"),
                    Some(i18n.t("settings.models.description")),
                    cx,
                )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(div().child(i18n.t("settings.providers.total_models")))
                            .child(
                                div()
                                    .px(px(8.0))
                                    .py(px(2.0))
                                    .rounded(px(4.0))
                                    .bg(theme.background)
                                    .text_sm()
                                    .child(i18n.format(
                                        "settings.models.available",
                                        &[("count", &state.models.len().to_string())],
                                    ))
                            )
                    )
                    .when(state.selected_model_name().is_some(), |el| {
                        el.child(
                            div()
                                .flex()
                                .items_center()
                                .justify_between()
                                .child(div().child(i18n.t("settings.providers.selected_model")))
                                .child(
                                    div()
                                        .px(px(8.0))
                                        .py(px(2.0))
                                        .rounded(px(4.0))
                                        .bg(theme.primary.opacity(0.15))
                                        .text_sm()
                                        .text_color(theme.primary)
                                        .child(state.selected_model_name().unwrap_or_default())
                                )
                        )
                    })
            )
    }

    fn render_keyboard_tab(&self, cx: &Context<Self>) -> impl IntoElement {
        let i18n = cx.global::<I18n>();
        let shortcuts = vec![
            (
                i18n.t("keyboard.category.navigation"),
                vec![
                    (i18n.t("keyboard.action.switch_sessions"), "Ctrl+1"),
                    (i18n.t("keyboard.action.switch_chat"), "Ctrl+2"),
                    (i18n.t("keyboard.action.switch_settings"), "Ctrl+,"),
                    (i18n.t("keyboard.action.prev_session"), "Ctrl+["),
                    (i18n.t("keyboard.action.next_session"), "Ctrl+]"),
                ],
            ),
            (
                i18n.t("keyboard.category.session"),
                vec![
                    (i18n.t("keyboard.action.new_session"), "Ctrl+N"),
                    (i18n.t("keyboard.action.close_session"), "Ctrl+W"),
                    (i18n.t("keyboard.action.rename_session"), "Ctrl+R"),
                ],
            ),
            (
                i18n.t("keyboard.category.chat"),
                vec![
                    (i18n.t("keyboard.action.send_message"), "Enter"),
                    (i18n.t("keyboard.action.new_line"), "Shift+Enter"),
                    (i18n.t("keyboard.action.clear_chat"), "Ctrl+L"),
                    (i18n.t("keyboard.action.history_up"), "Up"),
                    (i18n.t("keyboard.action.history_down"), "Down"),
                ],
            ),
            (
                i18n.t("keyboard.category.dialogs"),
                vec![
                    (i18n.t("keyboard.action.command_palette"), "Ctrl+K"),
                    (i18n.t("keyboard.action.model_picker"), "Ctrl+M"),
                    (i18n.t("keyboard.action.theme_picker"), "Ctrl+T"),
                    (i18n.t("keyboard.action.close_dialog"), "Escape"),
                ],
            ),
        ];

        div()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .children(shortcuts.iter().map(|(category, bindings)| {
                self.render_section(category.clone(), None, cx)
                    .children(bindings.iter().map(|(action, keys)| {
                        self.render_shortcut(action, keys, cx)
                    }))
            }))
    }

    fn render_shortcut(&self, action: &str, keys: &str, cx: &Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();

        div()
            .flex()
            .items_center()
            .justify_between()
            .py(px(8.0))
            .border_b_1()
            .border_color(theme.border_subtle)
            .child(div().child(action.to_string()))
            .child(
                div()
                    .flex()
                    .gap(px(4.0))
                    .children(keys.split('+').map(|key| {
                        div()
                            .px(px(8.0))
                            .py(px(4.0))
                            .rounded(px(4.0))
                            .bg(theme.background)
                            .border_1()
                            .border_color(theme.border)
                            .text_xs()
                            .font_family("monospace")
                            .child(key.to_string())
                    }))
            )
    }

    fn check_for_updates(&self, cx: &mut Context<Self>) {
        let api_state = cx.global::<ApiState>();
        let runtime = api_state.runtime.clone();
        let feed_url = cx.global::<AppState>().update_feed_url.clone();

        cx.update_global::<AppState, _>(|state, _cx| {
            state.set_update_status(UpdateStatus::Checking);
        });

        cx.spawn(async move |_this, cx| {
            let result = runtime.spawn(async move { update::check(&feed_url).await }).await;
            let check = match result {
                Ok(check) => check,
                Err(err) => UpdateCheck {
                    status: UpdateStatus::Error,
                    info: None,
                    error: Some(err.to_string()),
                    checked_at: None,
                },
            };
            let _ = cx.update(|cx| {
                let state = cx.global_mut::<AppState>();
                state.apply_update_check(check);
            });
        }).detach();
    }

    fn render_about_tab(&self, cx: &Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let state = cx.global::<AppState>();
        let i18n = cx.global::<I18n>();
        let version = update::current_version();
        let update_status = state.update_status;
        let update_info = state.update_info.clone();
        let last_checked = state
            .update_last_checked
            .map(format_checked_at)
            .unwrap_or_else(|| "-".to_string());

        let status_label = match update_status {
            UpdateStatus::Idle => i18n.t("settings.about.update_check"),
            UpdateStatus::Checking => i18n.t("settings.about.update_checking"),
            UpdateStatus::Available => i18n.t("settings.about.update_available"),
            UpdateStatus::UpToDate => i18n.t("settings.about.up_to_date"),
            UpdateStatus::Error => i18n.t("settings.about.update_error"),
        };

        let status_color = match update_status {
            UpdateStatus::Available => theme.success,
            UpdateStatus::Error => theme.error,
            UpdateStatus::Checking => theme.warning,
            _ => theme.text_muted,
        };

        div()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .child(
                self.render_section(i18n.t("settings.about.title"), None, cx)
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(12.0))
                            .items_center()
                            .py(px(20.0))
                            .child(
                                div()
                                    .w(px(64.0))
                                    .h(px(64.0))
                                    .rounded(px(16.0))
                                    .bg(theme.primary)
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .child(
                                        div()
                                            .text_2xl()
                                            .font_weight(FontWeight::BOLD)
                                            .text_color(theme.background)
                                            .child(i18n.t("app.short_name"))
                                    )
                            )
                            .child(
                                div()
                                    .text_xl()
                                    .font_weight(FontWeight::BOLD)
                                    .child(i18n.t("settings.about.product_name"))
                            )
                            .child(
                                div()
                                    .text_color(theme.text_muted)
                                    .child(i18n.format("settings.about.version", &[("version", version)]))
                            )
                            .child(
                                div()
                                    .text_sm()
                                    .text_color(theme.text_muted)
                                    .text_center()
                                    .max_w(px(400.0))
                                    .child(i18n.t("settings.about.description"))
                            )
                    )
            )
            .child(
                self.render_section(i18n.t("settings.about.update_section"), None, cx)
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(
                                div()
                                    .text_sm()
                                    .text_color(status_color)
                                    .child(status_label.clone())
                            )
                            .child(
                                div()
                                    .id("update-check")
                                    .px(px(12.0))
                                    .py(px(6.0))
                                    .rounded(px(6.0))
                                    .bg(theme.primary)
                                    .text_color(theme.background)
                                    .text_sm()
                                    .cursor_pointer()
                                    .hover(|s| s.opacity(0.9))
                                    .on_click(cx.listener(|this, _event, _window, cx| {
                                        this.check_for_updates(cx);
                                    }))
                                    .child(i18n.t("settings.about.update_check"))
                            )
                    )
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(6.0))
                            .mt(px(8.0))
                            .child(
                                div()
                                    .text_xs()
                                    .text_color(theme.text_muted)
                                    .child(format!(
                                        "{}: {}",
                                        i18n.t("settings.about.feed_url"),
                                        state.update_feed_url
                                    ))
                            )
                            .child(
                                div()
                                    .text_xs()
                                    .text_color(theme.text_muted)
                                    .child(format!(
                                        "{}: {}",
                                        i18n.t("settings.about.last_checked"),
                                        last_checked
                                    ))
                            )
                    )
                    .when(update_info.is_some(), |el| {
                        let info = update_info.clone().unwrap();
                        el.child(
                            div()
                                .mt(px(8.0))
                                .flex()
                                .items_center()
                                .justify_between()
                                .child(
                                    div()
                                        .text_sm()
                                        .text_color(theme.text_muted)
                                        .child(i18n.t("settings.about.latest_version"))
                                )
                                .child(
                                    div()
                                        .text_sm()
                                        .font_weight(FontWeight::MEDIUM)
                                        .child(info.version)
                                )
                        )
                    })
            )
            .child(
                self.render_section(i18n.t("settings.about.built_with"), None, cx)
                    .child(
                        div()
                            .flex()
                            .flex_wrap()
                            .gap(px(8.0))
                            .children(["Rust", "GPUI", "Tokio", "Reqwest"].iter().map(|tech| {
                                div()
                                    .px(px(12.0))
                                    .py(px(6.0))
                                    .rounded(px(6.0))
                                    .bg(theme.background)
                                    .border_1()
                                    .border_color(theme.border)
                                    .text_sm()
                                    .child(*tech)
                            }))
                    )
            )
    }
}

impl Render for SettingsView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let i18n = cx.global::<I18n>();

        div()
            .flex()
            .flex_col()
            .flex_1()
            .p(px(24.0))
            .bg(theme.background_panel)
            .flex().flex_col()
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .mb(px(24.0))
                    .child(
                        div()
                            .text_2xl()
                            .font_weight(FontWeight::BOLD)
                            .child(i18n.t("settings.title"))
                    )
            )
            .child(self.render_tabs(cx))
            .child(
                match self.active_tab {
                    SettingsTab::General => self.render_general_tab(cx).into_any_element(),
                    SettingsTab::Appearance => self.render_appearance_tab(cx).into_any_element(),
                    SettingsTab::Providers => self.render_providers_tab(cx).into_any_element(),
                    SettingsTab::Keyboard => self.render_keyboard_tab(cx).into_any_element(),
                    SettingsTab::About => self.render_about_tab(cx).into_any_element(),
                }
            )
    }
}

fn format_checked_at(ts: i64) -> String {
    if let Some(dt) = Local.timestamp_opt(ts, 0).single() {
        dt.format("%Y-%m-%d %H:%M").to_string()
    } else {
        ts.to_string()
    }
}
