//! Settings view
//!
//! Allows configuring the application and agent settings.

use gpui::prelude::*;
use gpui::*;
use crate::state::AppState;
use crate::theme::{Theme, ThemeRegistry};

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

        let tabs = [
            (SettingsTab::General, "General"),
            (SettingsTab::Appearance, "Appearance"),
            (SettingsTab::Providers, "Providers"),
            (SettingsTab::Keyboard, "Keyboard"),
            (SettingsTab::About, "About"),
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
                    .child(*label)
            }))
    }

    fn render_section(&self, title: &str, description: Option<&str>, cx: &Context<Self>) -> Div {
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
                            .child(title.to_string())
                    )
            );

        if let Some(desc) = description {
            section.child(
                div()
                    .text_sm()
                    .text_color(theme.text_muted)
                    .child(desc.to_string())
            )
        } else {
            section
        }
    }

    fn render_general_tab(&self, cx: &Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let state = cx.global::<AppState>();

        div()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .child(
                self.render_section("Connection", Some("Configure daemon connection settings"), cx)
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(div().child("Daemon URL"))
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
                            .child(div().child("Status"))
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
                                            .child(if state.connected { "Connected" } else { "Disconnected" })
                                    )
                            )
                    )
            )
            .child(
                self.render_section("Default Persona", Some("Select the default persona for new sessions"), cx)
                    .child(
                        div()
                            .flex()
                            .gap(px(8.0))
                            .child(self.render_persona_button("Zee", state.active_persona == crate::state::Persona::Zee, theme.zee_accent, cx))
                            .child(self.render_persona_button("Stanley", state.active_persona == crate::state::Persona::Stanley, theme.stanley_accent, cx))
                            .child(self.render_persona_button("Johny", state.active_persona == crate::state::Persona::Johny, theme.johny_accent, cx))
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

        div()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .child(
                self.render_section("Theme", Some("Choose your preferred color theme"), cx)
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(div().child("Current Theme"))
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
                                    .child("Dark Themes")
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
                                    .child("Light Themes")
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
                self.render_section("Sidebar", None, cx)
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(div().child("Sidebar Collapsed"))
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

        div()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .child(
                self.render_section("AI Providers", Some("Configure API keys for AI providers"), cx)
                    .children(
                        if state.providers.is_empty() {
                            vec![
                                div()
                                    .py(px(12.0))
                                    .text_color(theme.text_muted)
                                    .text_center()
                                    .child("No providers available. Start the daemon to load providers.")
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
                                                            .child(if has_key { "API key configured" } else { "Not configured" })
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
                                            .child(if has_key { "Edit" } else { "Add Key" })
                                    )
                                    .into_any_element()
                            }).collect()
                        }
                    )
            )
            .child(
                self.render_section("Models", Some("Available AI models"), cx)
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .justify_between()
                            .child(div().child("Total Models"))
                            .child(
                                div()
                                    .px(px(8.0))
                                    .py(px(2.0))
                                    .rounded(px(4.0))
                                    .bg(theme.background)
                                    .text_sm()
                                    .child(format!("{} available", state.models.len()))
                            )
                    )
                    .when(state.selected_model_name().is_some(), |el| {
                        el.child(
                            div()
                                .flex()
                                .items_center()
                                .justify_between()
                                .child(div().child("Selected Model"))
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
        let shortcuts = [
            ("Navigation", vec![
                ("Switch to Sessions", "Ctrl+1"),
                ("Switch to Chat", "Ctrl+2"),
                ("Switch to Settings", "Ctrl+,"),
                ("Previous Session", "Ctrl+["),
                ("Next Session", "Ctrl+]"),
            ]),
            ("Session", vec![
                ("New Session", "Ctrl+N"),
                ("Close Session", "Ctrl+W"),
                ("Rename Session", "Ctrl+R"),
            ]),
            ("Chat", vec![
                ("Send Message", "Enter"),
                ("New Line", "Shift+Enter"),
                ("Clear Chat", "Ctrl+L"),
                ("History Up", "Up"),
                ("History Down", "Down"),
            ]),
            ("Dialogs", vec![
                ("Command Palette", "Ctrl+K"),
                ("Model Picker", "Ctrl+M"),
                ("Theme Picker", "Ctrl+T"),
                ("Close Dialog", "Escape"),
            ]),
        ];

        div()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .children(shortcuts.iter().map(|(category, bindings)| {
                self.render_section(category, None, cx)
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

    fn render_about_tab(&self, cx: &Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();

        div()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .child(
                self.render_section("Agent Core Desktop", None, cx)
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
                                            .child("AC")
                                    )
                            )
                            .child(
                                div()
                                    .text_xl()
                                    .font_weight(FontWeight::BOLD)
                                    .child("Agent Core")
                            )
                            .child(
                                div()
                                    .text_color(theme.text_muted)
                                    .child("Version 0.1.0")
                            )
                            .child(
                                div()
                                    .text_sm()
                                    .text_color(theme.text_muted)
                                    .text_center()
                                    .max_w(px(400.0))
                                    .child("A native desktop interface for Agent Core, featuring the Personas triad (Zee, Stanley, Johny) and full agent capabilities.")
                            )
                    )
            )
            .child(
                self.render_section("Built With", None, cx)
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
                            .child("Settings")
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
