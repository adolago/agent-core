//! Stanley trading view for desktop-gpui.
//!
//! This module provides the trading UI when the Stanley persona is active,
//! including portfolio management, risk metrics, and paper trading.

use gpui::prelude::*;
use gpui::*;

use crate::i18n::I18n;
use crate::state::AppState;
use crate::theme::Theme;

/// Trading view component for Stanley persona
pub struct TradingView {
    _subscription: Subscription,
}

impl TradingView {
    pub fn new(cx: &mut Context<Self>) -> Self {
        let subscription = cx.observe_global::<AppState>(|_view, cx| {
            cx.notify();
        });

        Self {
            _subscription: subscription,
        }
    }
}

impl Render for TradingView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let state = cx.global::<AppState>();
        let i18n = cx.global::<I18n>();

        div()
            .flex()
            .flex_col()
            .flex_1()
            .bg(theme.background_panel)
            .text_color(theme.text)
            .p(px(24.0))
            .gap(px(16.0))
            .child(self.render_header(theme, i18n))
            .child(self.render_content(state, theme, i18n))
    }
}

impl TradingView {
    fn render_header(&self, theme: &Theme, i18n: &I18n) -> impl IntoElement {
        div()
            .flex()
            .items_center()
            .justify_between()
            .pb(px(16.0))
            .border_b_1()
            .border_color(theme.border)
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.0))
                    .child(
                        div()
                            .text_xl()
                            .font_weight(FontWeight::BOLD)
                            .text_color(theme.stanley_accent)
                            .child(i18n.t("trading.title")),
                    )
                    .child(
                        div()
                            .text_sm()
                            .text_color(theme.text_muted)
                            .child(i18n.t("trading.subtitle")),
                    ),
            )
    }

    fn render_content(&self, state: &AppState, theme: &Theme, i18n: &I18n) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .flex_1()
            .gap(px(16.0))
            .child(self.render_portfolio_section(state, theme, i18n))
            .child(self.render_risk_section(state, theme, i18n))
            .child(self.render_paper_trading_section(state, theme, i18n))
    }

    fn render_portfolio_section(&self, state: &AppState, theme: &Theme, i18n: &I18n) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .p(px(16.0))
            .bg(theme.background_element)
            .rounded(px(12.0))
            .border_1()
            .border_color(theme.border_subtle)
            .child(
                div()
                    .text_lg()
                    .font_weight(FontWeight::SEMIBOLD)
                    .mb(px(12.0))
                    .child(i18n.t("trading.portfolio")),
            )
            .child(
                if let Some(portfolio) = &state.portfolio {
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(8.0))
                        .child(
                            div()
                                .flex()
                                .justify_between()
                                .child(div().text_color(theme.text_muted).child(i18n.t("trading.positions")))
                                .child(
                                    div()
                                        .font_weight(FontWeight::MEDIUM)
                                        .child(format!("{}", portfolio.positions.len())),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .justify_between()
                                .child(div().text_color(theme.text_muted).child(i18n.t("trading.cash")))
                                .child(
                                    div()
                                        .font_weight(FontWeight::MEDIUM)
                                        .child(format!("${:.2}", portfolio.cash)),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .justify_between()
                                .child(div().text_color(theme.text_muted).child(i18n.t("trading.total_cost")))
                                .child(
                                    div()
                                        .font_weight(FontWeight::MEDIUM)
                                        .child(format!("${:.2}", portfolio.total_cost())),
                                ),
                        )
                        .into_any_element()
                } else {
                    div()
                        .text_color(theme.text_muted)
                        .child(i18n.t("trading.no_portfolio"))
                        .into_any_element()
                },
            )
    }

    fn render_risk_section(&self, state: &AppState, theme: &Theme, i18n: &I18n) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .p(px(16.0))
            .bg(theme.background_element)
            .rounded(px(12.0))
            .border_1()
            .border_color(theme.border_subtle)
            .child(
                div()
                    .text_lg()
                    .font_weight(FontWeight::SEMIBOLD)
                    .mb(px(12.0))
                    .child(i18n.t("trading.risk_metrics")),
            )
            .child(
                if let Some(metrics) = &state.risk_metrics {
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(8.0))
                        .child(
                            div()
                                .flex()
                                .justify_between()
                                .child(
                                    div()
                                        .text_color(theme.text_muted)
                                        .child(i18n.format(
                                            "trading.var",
                                            &[(
                                                "percent",
                                                &format!("{:.0}", metrics.confidence_level * 100.0),
                                            )],
                                        )),
                                )
                                .child(
                                    div()
                                        .font_weight(FontWeight::MEDIUM)
                                        .child(format!("${:.2}", metrics.var)),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .justify_between()
                                .child(div().text_color(theme.text_muted).child(i18n.t("trading.sharpe")))
                                .child(
                                    div()
                                        .font_weight(FontWeight::MEDIUM)
                                        .child(format!("{:.2}", metrics.sharpe_ratio)),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .justify_between()
                                .child(div().text_color(theme.text_muted).child(i18n.t("trading.sortino")))
                                .child(
                                    div()
                                        .font_weight(FontWeight::MEDIUM)
                                        .child(format!("{:.2}", metrics.sortino_ratio)),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .justify_between()
                                .child(div().text_color(theme.text_muted).child(i18n.t("trading.max_drawdown")))
                                .child(
                                    div()
                                        .font_weight(FontWeight::MEDIUM)
                                        .text_color(if metrics.max_drawdown_percent < -10.0 {
                                            theme.error
                                        } else {
                                            theme.text
                                        })
                                        .child(format!("{:.2}%", metrics.max_drawdown_percent)),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .justify_between()
                                .child(div().text_color(theme.text_muted).child(i18n.t("trading.volatility")))
                                .child(
                                    div()
                                        .font_weight(FontWeight::MEDIUM)
                                        .child(format!("{:.2}%", metrics.volatility_percent)),
                                ),
                        )
                        .into_any_element()
                } else {
                    div()
                        .text_color(theme.text_muted)
                        .child(i18n.t("trading.no_risk"))
                        .into_any_element()
                },
            )
    }

    fn render_paper_trading_section(&self, state: &AppState, theme: &Theme, i18n: &I18n) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .p(px(16.0))
            .bg(theme.background_element)
            .rounded(px(12.0))
            .border_1()
            .border_color(theme.border_subtle)
            .child(
                div()
                    .text_lg()
                    .font_weight(FontWeight::SEMIBOLD)
                    .mb(px(12.0))
                    .child(i18n.t("trading.paper_trading")),
            )
            .child(
                if let Some(status) = &state.paper_trading {
                    if status.active {
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(8.0))
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
                                            .bg(theme.success),
                                    )
                                            .child(
                                                div()
                                                    .text_color(theme.success)
                                                    .font_weight(FontWeight::MEDIUM)
                                                    .child(i18n.t("trading.active")),
                                            ),
                            )
                            .child(
                                div()
                                    .flex()
                                    .justify_between()
                                    .child(div().text_color(theme.text_muted).child(i18n.t("trading.strategy")))
                                    .child(
                                        div()
                                            .font_weight(FontWeight::MEDIUM)
                                            .child(
                                                status
                                                    .strategy
                                                    .clone()
                                                    .unwrap_or_else(|| i18n.t("tool.status.unknown")),
                                            ),
                                    ),
                            )
                            .child(
                                div()
                                    .flex()
                                    .justify_between()
                                    .child(div().text_color(theme.text_muted).child(i18n.t("trading.total_value")))
                                    .child(
                                        div()
                                            .font_weight(FontWeight::MEDIUM)
                                            .child(format!("${:.2}", status.total_value)),
                                    ),
                            )
                            .child(
                                div()
                                    .flex()
                                    .justify_between()
                                    .child(div().text_color(theme.text_muted).child(i18n.t("trading.return")))
                                    .child(
                                        div()
                                            .font_weight(FontWeight::MEDIUM)
                                            .text_color(if status.total_return_percent >= 0.0 {
                                                theme.success
                                            } else {
                                                theme.error
                                            })
                                            .child(format!(
                                                "{}{:.2}%",
                                                if status.total_return_percent >= 0.0 { "+" } else { "" },
                                                status.total_return_percent
                                            )),
                                    ),
                            )
                            .child(
                                div()
                                    .flex()
                                    .justify_between()
                                    .child(div().text_color(theme.text_muted).child(i18n.t("trading.trades")))
                                    .child(
                                        div()
                                            .font_weight(FontWeight::MEDIUM)
                                            .child(format!("{}", status.trade_count)),
                                    ),
                            )
                            .into_any_element()
                    } else {
                        div()
                            .text_color(theme.text_muted)
                            .child(i18n.t("trading.no_active"))
                            .into_any_element()
                    }
                } else {
                    div()
                        .text_color(theme.text_muted)
                        .child(i18n.t("trading.not_initialized"))
                        .into_any_element()
                },
            )
    }
}
