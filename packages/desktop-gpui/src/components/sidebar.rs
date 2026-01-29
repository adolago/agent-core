//! Sidebar component
//!
//! Navigation sidebar with persona switching and view navigation.
//! Renders inline within the parent AppRoot context.

use gpui::prelude::*;
use gpui::*;
use crate::app::AppRoot;
use crate::i18n::I18n;
use crate::state::{ActiveView, Persona};
use crate::theme::Theme;

/// Sidebar rendering functions
///
/// Instead of being a separate Entity, Sidebar provides static methods
/// that render within the parent's context, allowing direct state updates.
pub struct Sidebar;

impl Sidebar {
    /// Render the sidebar inline within the AppRoot context
    pub fn render_inline(
        active_persona: Persona,
        active_view: ActiveView,
        collapsed: bool,
        cx: &mut Context<AppRoot>,
    ) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let width = if collapsed { px(64.0) } else { px(240.0) };

        div()
            .w(width)
            .h_full()
            .flex()
            .flex_col()
            .bg(theme.background)
            .border_r_1()
            .border_color(theme.border)
            .child(Self::render_header(collapsed, cx))
            .child(Self::render_personas(active_persona, collapsed, cx))
            .child(Self::render_navigation(active_view, collapsed, cx))
            .child(Self::render_footer(collapsed, cx))
    }

    fn render_header(collapsed: bool, cx: &Context<AppRoot>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let i18n = cx.global::<I18n>();

        div()
            .h(px(48.0))
            .px(px(12.0))
            .flex()
            .items_center()
            .border_b_1()
            .border_color(theme.border)
            .child(
                if collapsed {
                    div()
                        .text_lg()
                        .font_weight(FontWeight::BOLD)
                        .text_color(theme.primary)
                        .child(i18n.t("app.short_name"))
                } else {
                    div()
                        .flex()
                        .items_center()
                        .gap(px(8.0))
                        .child(
                            div()
                                .w(px(24.0))
                                .h(px(24.0))
                                .rounded(px(6.0))
                                .bg(theme.primary)
                                .flex()
                                .items_center()
                                .justify_center()
                                .child(
                                    div()
                                        .text_sm()
                                        .font_weight(FontWeight::BOLD)
                                        .text_color(theme.background)
                                        .child(i18n.t("app.short_name"))
                                )
                        )
                        .child(
                            div()
                                .text_lg()
                                .font_weight(FontWeight::BOLD)
                                .child(i18n.t("app.name"))
                        )
                }
            )
    }

    fn render_personas(
        active_persona: Persona,
        collapsed: bool,
        cx: &mut Context<AppRoot>,
    ) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let i18n = cx.global::<I18n>();

        div()
            .p(px(8.0))
            .flex()
            .flex_col()
            .gap(px(4.0))
            .child(
                div()
                    .px(px(8.0))
                    .py(px(4.0))
                    .text_xs()
                    .text_color(theme.text_muted)
                    .font_weight(FontWeight::MEDIUM)
                    .child(if collapsed { "" } else { i18n.t("nav.personas") })
            )
            .child(Self::render_persona_item(Persona::Zee, active_persona, collapsed, cx))
            .child(Self::render_persona_item(Persona::Stanley, active_persona, collapsed, cx))
            .child(Self::render_persona_item(Persona::Johny, active_persona, collapsed, cx))
    }

    fn render_persona_item(
        persona: Persona,
        active_persona: Persona,
        collapsed: bool,
        cx: &mut Context<AppRoot>,
    ) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let i18n = cx.global::<I18n>();
        let is_active = active_persona == persona;

        let accent = match persona {
            Persona::Zee => theme.zee_accent,
            Persona::Stanley => theme.stanley_accent,
            Persona::Johny => theme.johny_accent,
        };

        let bg = if is_active {
            accent.opacity(0.15)
        } else {
            Hsla::transparent_black()
        };

        let hover_bg = theme.background_element;
        let text_muted = theme.text_muted;
        let (name, desc) = match persona {
            Persona::Zee => (
                i18n.t("persona.zee.name"),
                i18n.t("persona.zee.description"),
            ),
            Persona::Stanley => (
                i18n.t("persona.stanley.name"),
                i18n.t("persona.stanley.description"),
            ),
            Persona::Johny => (
                i18n.t("persona.johny.name"),
                i18n.t("persona.johny.description"),
            ),
        };

        div()
            .id(SharedString::from(format!("persona-{:?}", persona)))
            .px(px(8.0))
            .py(px(6.0))
            .rounded(px(6.0))
            .bg(bg)
            .cursor_pointer()
            .hover(move |style| style.bg(hover_bg))
            .on_click(cx.listener(move |this, _event, _window, cx| {
                this.set_persona(persona, cx);
            }))
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
                    .when(!collapsed, |el| {
                        el.child(
                            div()
                                .flex()
                                .flex_col()
                                .child(
                                    div()
                                        .font_weight(FontWeight::MEDIUM)
                                        .child(name.clone())
                                )
                                .child(
                                    div()
                                        .text_xs()
                                        .text_color(text_muted)
                                        .child(desc.clone())
                                )
                        )
                    })
            )
    }

    fn render_navigation(
        active_view: ActiveView,
        collapsed: bool,
        cx: &mut Context<AppRoot>,
    ) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let i18n = cx.global::<I18n>();

        div()
            .flex_1()
            .p(px(8.0))
            .flex()
            .flex_col()
            .gap(px(4.0))
            .child(
                div()
                    .px(px(8.0))
                    .py(px(4.0))
                    .text_xs()
                    .text_color(theme.text_muted)
                    .font_weight(FontWeight::MEDIUM)
                    .child(if collapsed { "" } else { i18n.t("nav.navigation") })
            )
            .child(Self::render_nav_item(&i18n.t("nav.sessions"), "S", ActiveView::Sessions, active_view, collapsed, cx))
            .child(Self::render_nav_item(&i18n.t("nav.chat"), "C", ActiveView::Chat, active_view, collapsed, cx))
            .child(Self::render_nav_item(&i18n.t("nav.settings"), "G", ActiveView::Settings, active_view, collapsed, cx))
    }

    fn render_nav_item(
        label: &str,
        icon: &str,
        view: ActiveView,
        active_view: ActiveView,
        collapsed: bool,
        cx: &mut Context<AppRoot>,
    ) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let is_active = active_view == view;

        let bg = if is_active {
            theme.primary.opacity(0.15)
        } else {
            Hsla::transparent_black()
        };

        let text_color = if is_active {
            theme.primary
        } else {
            theme.text
        };

        let hover_bg = theme.background_element;
        let display_label = if collapsed {
            icon.to_string()
        } else {
            label.to_string()
        };

        div()
            .id(SharedString::from(format!("nav-{:?}", view)))
            .px(px(8.0))
            .py(px(8.0))
            .rounded(px(6.0))
            .bg(bg)
            .cursor_pointer()
            .hover(move |style| style.bg(hover_bg))
            .on_click(cx.listener(move |this, _event, _window, cx| {
                this.set_view(view, cx);
            }))
            .child(
                div()
                    .text_color(text_color)
                    .font_weight(if is_active { FontWeight::MEDIUM } else { FontWeight::NORMAL })
                    .child(display_label)
            )
    }

    fn render_footer(collapsed: bool, cx: &mut Context<AppRoot>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let i18n = cx.global::<I18n>();
        let hover_bg = theme.background_element;
        let text_muted = theme.text_muted;
        let label = if collapsed {
            format!(">> {}", i18n.t("nav.expand"))
        } else {
            format!("<< {}", i18n.t("nav.collapse"))
        };

        div()
            .p(px(8.0))
            .border_t_1()
            .border_color(theme.border)
            .child(
                div()
                    .id("collapse-toggle")
                    .px(px(8.0))
                    .py(px(6.0))
                    .rounded(px(6.0))
                    .cursor_pointer()
                    .hover(move |style| style.bg(hover_bg))
                    .on_click(cx.listener(|this, _event, _window, cx| {
                        this.toggle_sidebar(cx);
                    }))
                    .child(
                        div()
                            .text_sm()
                            .text_color(text_muted)
                            .child(label)
                    )
            )
    }
}
