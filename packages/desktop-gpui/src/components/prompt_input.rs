//! Prompt input component for chat
//!
//! A multi-line text input with file attachment support and send button.

use gpui::prelude::*;
use gpui::*;
use crate::i18n::I18n;
use crate::theme::Theme;

/// Event emitted when user wants to send a message
#[derive(Clone)]
pub struct SendMessage {
    pub content: String,
}

/// Prompt input component
pub struct PromptInput {
    focus_handle: FocusHandle,
    text: String,
    cursor_position: usize,
    placeholder: String,
    disabled: bool,
    loading: bool,
}

impl PromptInput {
    pub fn new(cx: &mut Context<Self>) -> Self {
        let i18n = cx.global::<I18n>();
        Self {
            focus_handle: cx.focus_handle(),
            text: String::new(),
            cursor_position: 0,
            placeholder: i18n.t("prompt.placeholder"),
            disabled: false,
            loading: false,
        }
    }

    pub fn set_placeholder(&mut self, placeholder: &str) {
        self.placeholder = placeholder.to_string();
    }

    pub fn set_disabled(&mut self, disabled: bool, cx: &mut Context<Self>) {
        self.disabled = disabled;
        cx.notify();
    }

    pub fn set_loading(&mut self, loading: bool, cx: &mut Context<Self>) {
        self.loading = loading;
        cx.notify();
    }

    pub fn clear(&mut self, cx: &mut Context<Self>) {
        self.text.clear();
        self.cursor_position = 0;
        cx.notify();
    }

    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn focus(&self, window: &mut Window, cx: &mut Context<Self>) {
        self.focus_handle.focus(window, cx);
    }

    fn insert_char(&mut self, c: char, cx: &mut Context<Self>) {
        if self.disabled || self.loading {
            return;
        }
        self.text.insert(self.cursor_position, c);
        self.cursor_position += c.len_utf8();
        cx.notify();
    }

    fn insert_text(&mut self, text: &str, cx: &mut Context<Self>) {
        if self.disabled || self.loading {
            return;
        }
        self.text.insert_str(self.cursor_position, text);
        self.cursor_position += text.len();
        cx.notify();
    }

    fn backspace(&mut self, cx: &mut Context<Self>) {
        if self.disabled || self.loading || self.cursor_position == 0 {
            return;
        }
        // Find the previous character boundary
        let prev_char_boundary = self.text[..self.cursor_position]
            .char_indices()
            .last()
            .map(|(i, _)| i)
            .unwrap_or(0);
        self.text.remove(prev_char_boundary);
        self.cursor_position = prev_char_boundary;
        cx.notify();
    }

    fn delete(&mut self, cx: &mut Context<Self>) {
        if self.disabled || self.loading || self.cursor_position >= self.text.len() {
            return;
        }
        self.text.remove(self.cursor_position);
        cx.notify();
    }

    fn move_left(&mut self, cx: &mut Context<Self>) {
        if self.cursor_position > 0 {
            // Find the previous character boundary
            self.cursor_position = self.text[..self.cursor_position]
                .char_indices()
                .last()
                .map(|(i, _)| i)
                .unwrap_or(0);
            cx.notify();
        }
    }

    fn move_right(&mut self, cx: &mut Context<Self>) {
        if self.cursor_position < self.text.len() {
            // Find the next character boundary
            self.cursor_position = self.text[self.cursor_position..]
                .char_indices()
                .nth(1)
                .map(|(i, _)| self.cursor_position + i)
                .unwrap_or(self.text.len());
            cx.notify();
        }
    }

    fn move_to_start(&mut self, cx: &mut Context<Self>) {
        self.cursor_position = 0;
        cx.notify();
    }

    fn move_to_end(&mut self, cx: &mut Context<Self>) {
        self.cursor_position = self.text.len();
        cx.notify();
    }

    fn handle_key_down(&mut self, event: &KeyDownEvent, cx: &mut Context<Self>) {
        if self.disabled || self.loading {
            return;
        }

        let modifiers = event.keystroke.modifiers;

        match &event.keystroke.key {
            key if key == "backspace" => {
                self.backspace(cx);
            }
            key if key == "delete" => {
                self.delete(cx);
            }
            key if key == "left" => {
                self.move_left(cx);
            }
            key if key == "right" => {
                self.move_right(cx);
            }
            key if key == "home" || (key == "a" && modifiers.control) => {
                self.move_to_start(cx);
            }
            key if key == "end" || (key == "e" && modifiers.control) => {
                self.move_to_end(cx);
            }
            key if key == "enter" => {
                if modifiers.shift {
                    // Shift+Enter: new line
                    self.insert_char('\n', cx);
                } else if modifiers.control || modifiers.platform {
                    // Ctrl/Cmd+Enter: send
                    if !self.text.trim().is_empty() {
                        cx.emit(SendMessage {
                            content: self.text.clone(),
                        });
                    }
                } else {
                    // Plain Enter: send (single line behavior)
                    if !self.text.trim().is_empty() && !self.text.contains('\n') {
                        cx.emit(SendMessage {
                            content: self.text.clone(),
                        });
                    } else {
                        // Multi-line: add new line
                        self.insert_char('\n', cx);
                    }
                }
            }
            key if key == "k" && modifiers.control => {
                // Ctrl+K: clear line from cursor
                self.text.truncate(self.cursor_position);
                cx.notify();
            }
            _ => {
                // Handle regular character input via key_char
                if let Some(key_char) = &event.keystroke.key_char {
                    if !modifiers.control && !modifiers.alt && !modifiers.platform {
                        self.insert_text(key_char, cx);
                    }
                } else if !modifiers.control && !modifiers.alt && !modifiers.platform {
                    // Single character key press (fallback)
                    let key = &event.keystroke.key;
                    if key.len() == 1 {
                        if let Some(c) = key.chars().next() {
                            if c.is_alphanumeric() || c.is_whitespace() || c.is_ascii_punctuation() {
                                self.insert_char(c, cx);
                            }
                        }
                    } else if key == "space" {
                        self.insert_char(' ', cx);
                    }
                }
            }
        }
    }

    fn render_text_with_cursor(&self, is_focused: bool, theme: &Theme) -> impl IntoElement {
        if self.text.is_empty() {
            return div()
                .text_color(theme.text_muted)
                .child(self.placeholder.clone())
                .into_any_element();
        }

        // Split text at cursor position
        let (before, after) = self.text.split_at(self.cursor_position);

        div()
            .flex()
            .child(
                div().child(before.to_string())
            )
            .when(is_focused, |el| {
                // Cursor
                el.child(
                    div()
                        .w(px(2.0))
                        .h(px(18.0))
                        .bg(theme.primary)
                )
            })
            .child(
                div().child(after.to_string())
            )
            .into_any_element()
    }
}

impl EventEmitter<SendMessage> for PromptInput {}

impl Render for PromptInput {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.global::<Theme>();
        let is_focused = self.focus_handle.is_focused(window);
        let can_send = !self.text.trim().is_empty() && !self.disabled && !self.loading;

        let border_color = if is_focused {
            theme.primary
        } else {
            theme.border
        };

        div()
            .p(px(16.0))
            .border_t_1()
            .border_color(theme.border)
            .bg(theme.background_panel)
            .child(
                div()
                    .flex()
                    .gap(px(12.0))
                    // File attachment button
                    .child(
                        div()
                            .id("attach-button")
                            .w(px(44.0))
                            .h(px(44.0))
                            .rounded(px(12.0))
                            .bg(theme.background_element)
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .hover(|s| s.bg(theme.background))
                            .child(
                                div()
                                    .text_color(theme.text_muted)
                                    .child("+")
                            )
                    )
                    // Input area
                    .child(
                        div()
                            .id("prompt-input")
                            .track_focus(&self.focus_handle)
                            .flex_1()
                            .min_h(px(44.0))
                            .max_h(px(200.0))
                            .px(px(14.0))
                            .py(px(10.0))
                            .rounded(px(12.0))
                            .bg(theme.background_element)
                            .border_1()
                            .border_color(border_color)
                            .cursor_text()
                            .on_key_down(cx.listener(|this, event, _window, cx| {
                                this.handle_key_down(event, cx);
                            }))
                            .child(self.render_text_with_cursor(is_focused, theme))
                    )
                    // Send button
                    .child(
                        div()
                            .id("send-button")
                            .w(px(44.0))
                            .h(px(44.0))
                            .rounded(px(12.0))
                            .bg(if can_send { theme.primary } else { theme.background_element })
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor(if can_send { CursorStyle::PointingHand } else { CursorStyle::default() })
                            .when(can_send, |el| {
                                el.hover(|s| s.opacity(0.9))
                                    .on_click(cx.listener(|this, _event, _window, cx| {
                                        if !this.text.trim().is_empty() {
                                            cx.emit(SendMessage {
                                                content: this.text.clone(),
                                            });
                                        }
                                    }))
                            })
                            .child(
                                if self.loading {
                                    // Loading indicator
                                    div()
                                        .w(px(16.0))
                                        .h(px(16.0))
                                        .rounded_full()
                                        .border_2()
                                        .border_color(theme.background)
                                        .into_any_element()
                                } else {
                                    div()
                                        .text_color(if can_send { theme.background } else { theme.text_muted })
                                        .child("→")
                                        .into_any_element()
                                }
                            )
                    )
            )
    }
}
