//! Question prompt dialog
//!
//! Renders questions from the daemon and allows the user to select answers.

use gpui::prelude::*;
use gpui::*;
use std::cell::RefCell;
use std::collections::HashSet;
use std::rc::Rc;

use crate::api::types::{QuestionInfo, QuestionReplyRequest, QuestionRequest};
use crate::api::ApiState;
use crate::i18n::I18n;
use crate::theme::Theme;

/// State for question selection
#[derive(Debug, Clone)]
pub struct QuestionState {
    /// Selected options per question (index into questions array -> set of selected option labels)
    pub selections: Vec<HashSet<String>>,
    /// Custom input values per question
    pub custom_inputs: Vec<String>,
}

impl QuestionState {
    pub fn new(questions: &[QuestionInfo]) -> Self {
        Self {
            selections: questions.iter().map(|_| HashSet::new()).collect(),
            custom_inputs: questions.iter().map(|_| String::new()).collect(),
        }
    }
}

/// Render a question prompt overlay
///
/// This is rendered as a blocking overlay when a question request is pending.
pub fn render_question_prompt(
    request: &QuestionRequest,
    state: Rc<RefCell<QuestionState>>,
    theme: &Theme,
    cx: &mut App,
) -> impl IntoElement {
    let request_id = request.id.clone();
    let questions = request.questions.clone();

    div()
        .id("question-prompt-overlay")
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
        .child(render_question_card(
            request_id,
            questions,
            state,
            theme,
            cx,
        ))
}

fn render_question_card(
    request_id: String,
    questions: Vec<QuestionInfo>,
    state: Rc<RefCell<QuestionState>>,
    theme: &Theme,
    cx: &mut App,
) -> impl IntoElement {
    let i18n = cx.global::<I18n>();
    let state_for_submit = state.clone();
    let questions_for_submit = questions.clone();
    let request_id_for_submit = request_id.clone();

    div()
        .id("question-card")
        .w(px(550.0))
        .max_h(px(700.0))
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
                    // Question icon
                    div()
                        .w(px(40.0))
                        .h(px(40.0))
                        .rounded_full()
                        .bg(theme.info.opacity(0.15))
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            div()
                                .text_lg()
                                .text_color(theme.info)
                                .child("?"),
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
                                .child(i18n.t("question.title")),
                        )
                        .child(
                            div()
                                .text_sm()
                                .text_color(theme.text_muted)
                                .child(i18n.format(
                                    "question.count",
                                    &[
                                        ("count", &questions.len().to_string()),
                                        ("suffix", if questions.len() == 1 { "" } else { "s" }),
                                    ],
                                )),
                        ),
                ),
        )
        // Questions
        .child(
            div()
                .flex_1()
                .p(px(20.0))
                .flex()
                .flex_col()
                .gap(px(24.0))
                .children(
                    questions
                        .iter()
                        .enumerate()
                        .map(|(idx, q)| render_question(idx, q, state.clone(), theme, cx)),
                ),
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
                .justify_end()
                .gap(px(8.0))
                .child(
                    div()
                        .id("question-cancel")
                        .px(px(16.0))
                        .py(px(8.0))
                        .rounded(px(6.0))
                        .bg(theme.background_element)
                        .text_color(theme.text)
                        .text_sm()
                        .font_weight(FontWeight::MEDIUM)
                        .cursor_pointer()
                        .hover(|s| s.opacity(0.9))
                        .on_click({
                            let request_id = request_id.clone();
                            move |_event, _window, cx| {
                                // Send empty response to reject/cancel
                                send_question_reply(request_id.clone(), vec![], cx);
                            }
                        })
                        .child(i18n.t("question.cancel")),
                )
                .child(
                    div()
                        .id("question-submit")
                        .px(px(16.0))
                        .py(px(8.0))
                        .rounded(px(6.0))
                        .bg(theme.primary)
                        .text_color(theme.background)
                        .text_sm()
                        .font_weight(FontWeight::MEDIUM)
                        .cursor_pointer()
                        .hover(|s| s.opacity(0.9))
                        .on_click(move |_event, _window, cx| {
                            let answers = collect_answers(
                                &state_for_submit.borrow(),
                                &questions_for_submit,
                            );
                            send_question_reply(request_id_for_submit.clone(), answers, cx);
                        })
                        .child(i18n.t("question.submit")),
                ),
        )
}

fn render_question(
    index: usize,
    question: &QuestionInfo,
    state: Rc<RefCell<QuestionState>>,
    theme: &Theme,
    _cx: &mut App,
) -> impl IntoElement {
    let header = question.header.clone();
    let question_text = question.question.clone();
    let options = question.options.clone();
    let multiple = question.multiple;
    let custom = question.custom;

    div()
        .flex()
        .flex_col()
        .gap(px(12.0))
        // Question header
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(4.0))
                .child(
                    div()
                        .text_xs()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(theme.primary)
                        .child(header),
                )
                .child(
                    div()
                        .font_weight(FontWeight::MEDIUM)
                        .child(question_text),
                ),
        )
        // Options
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(8.0))
                .children(options.iter().enumerate().map(|(opt_idx, opt)| {
                    let label = opt.label.clone();
                    let description = opt.description.clone();
                    let state_for_option = state.clone();

                    let is_selected = {
                        let s = state.borrow();
                        s.selections
                            .get(index)
                            .map(|set| set.contains(&label))
                            .unwrap_or(false)
                    };

                    div()
                        .id(SharedString::from(format!("q{}-opt{}", index, opt_idx)))
                        .px(px(12.0))
                        .py(px(10.0))
                        .rounded(px(8.0))
                        .border_1()
                        .border_color(if is_selected {
                            theme.primary
                        } else {
                            theme.border_subtle
                        })
                        .bg(if is_selected {
                            theme.primary.opacity(0.1)
                        } else {
                            theme.background_element
                        })
                        .cursor_pointer()
                        .hover(|s| s.bg(theme.background_element.opacity(0.8)))
                        .on_click({
                            let label = label.clone();
                            move |_event, _window, _cx| {
                                let mut s = state_for_option.borrow_mut();
                                if let Some(selections) = s.selections.get_mut(index) {
                                    if multiple {
                                        // Toggle selection for multi-select
                                        if selections.contains(&label) {
                                            selections.remove(&label);
                                        } else {
                                            selections.insert(label.clone());
                                        }
                                    } else {
                                        // Single select - clear and set
                                        selections.clear();
                                        selections.insert(label.clone());
                                    }
                                }
                            }
                        })
                        .child(
                            div()
                                .flex()
                                .items_start()
                                .gap(px(10.0))
                                // Checkbox/Radio indicator
                                .child(
                                    div()
                                        .mt(px(2.0))
                                        .w(px(18.0))
                                        .h(px(18.0))
                                        .rounded(if multiple { px(4.0) } else { px(9.0) })
                                        .border_2()
                                        .border_color(if is_selected {
                                            theme.primary
                                        } else {
                                            theme.border
                                        })
                                        .flex()
                                        .items_center()
                                        .justify_center()
                                        .when(is_selected, |el| {
                                            el.bg(theme.primary).child(
                                                div()
                                                    .text_xs()
                                                    .text_color(theme.background)
                                                    .child("✓"),
                                            )
                                        }),
                                )
                                // Label and description
                                .child(
                                    div()
                                        .flex()
                                        .flex_col()
                                        .gap(px(2.0))
                                        .child(
                                            div()
                                                .font_weight(if is_selected {
                                                    FontWeight::MEDIUM
                                                } else {
                                                    FontWeight::NORMAL
                                                })
                                                .child(label.clone()),
                                        )
                                        .when(description.is_some(), |el| {
                                            el.child(
                                                div()
                                                    .text_sm()
                                                    .text_color(theme.text_muted)
                                                    .child(description.clone().unwrap_or_default()),
                                            )
                                        }),
                                ),
                        )
                })),
        )
        // Custom input (if allowed)
        .when(custom, |el| {
            let state_for_custom = state.clone();
            el.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(
                        div()
                            .text_sm()
                            .text_color(theme.text_muted)
                            .child(i18n.t("question.custom")),
                    )
                    .child(
                        div()
                            .flex_1()
                            .px(px(12.0))
                            .py(px(8.0))
                            .rounded(px(6.0))
                            .bg(theme.background_element)
                            .border_1()
                            .border_color(theme.border)
                            .text_sm()
                            .text_color(theme.text_muted)
                            .child({
                                let s = state_for_custom.borrow();
                                s.custom_inputs
                                    .get(index)
                                    .cloned()
                                    .unwrap_or_default()
                                    .is_empty()
                                    .then(|| i18n.t("question.custom_placeholder"))
                                    .unwrap_or("")
                            }),
                    ),
            )
        })
}

fn collect_answers(state: &QuestionState, questions: &[QuestionInfo]) -> Vec<Vec<String>> {
    questions
        .iter()
        .enumerate()
        .map(|(idx, _q)| {
            let mut answers = Vec::new();

            // Add selected options
            if let Some(selections) = state.selections.get(idx) {
                answers.extend(selections.iter().cloned());
            }

            // Add custom input if present
            if let Some(custom) = state.custom_inputs.get(idx) {
                if !custom.is_empty() {
                    answers.push(custom.clone());
                }
            }

            answers
        })
        .collect()
}

fn send_question_reply(request_id: String, answers: Vec<Vec<String>>, cx: &mut App) {
    let api_state = cx.global::<ApiState>();
    let client = api_state.client.clone();
    let runtime = api_state.runtime.clone();

    let request = QuestionReplyRequest {
        request_id,
        answers,
    };

    // Fire and forget - the event stream will handle the reply event
    let _ = runtime.spawn(async move {
        if let Err(e) = client.reply_question(request).await {
            tracing::error!("Failed to reply to question: {}", e);
        }
    });
}
