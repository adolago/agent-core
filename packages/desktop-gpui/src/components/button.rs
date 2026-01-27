//! Button component
//!
//! Provides styled button variants.


/// Button variant
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ButtonVariant {
    #[default]
    Primary,
    Secondary,
    Ghost,
    Danger,
}

/// Button component
pub struct Button {
    pub label: String,
    pub variant: ButtonVariant,
    pub disabled: bool,
    pub loading: bool,
}

impl Button {
    pub fn primary(label: &str) -> Self {
        Self {
            label: label.to_string(),
            variant: ButtonVariant::Primary,
            disabled: false,
            loading: false,
        }
    }

    pub fn secondary(label: &str) -> Self {
        Self {
            label: label.to_string(),
            variant: ButtonVariant::Secondary,
            disabled: false,
            loading: false,
        }
    }
}
