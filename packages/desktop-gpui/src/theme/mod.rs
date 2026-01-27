//! Theme system for Agent Core Desktop
//!
//! Provides 30+ themes ported from OpenCode's theme collection.
//! Themes can be dynamically loaded from JSON or use built-in definitions.

mod colors;
mod themes;

pub use colors::*;
pub use themes::*;

use gpui::*;
use std::collections::HashMap;

// ============================================================================
// Theme Structure
// ============================================================================

/// Complete theme with all color definitions
#[derive(Debug, Clone)]
pub struct Theme {
    pub id: &'static str,
    pub name: &'static str,
    pub is_dark: bool,

    // Core colors
    pub primary: Hsla,
    pub secondary: Hsla,
    pub accent: Hsla,

    // Status colors
    pub error: Hsla,
    pub warning: Hsla,
    pub success: Hsla,
    pub info: Hsla,

    // Text colors
    pub text: Hsla,
    pub text_muted: Hsla,

    // Background colors
    pub background: Hsla,
    pub background_panel: Hsla,
    pub background_element: Hsla,

    // Border colors
    pub border: Hsla,
    pub border_active: Hsla,
    pub border_subtle: Hsla,

    // Diff colors
    pub diff_added: Hsla,
    pub diff_removed: Hsla,
    pub diff_context: Hsla,
    pub diff_hunk_header: Hsla,
    pub diff_highlight_added: Hsla,
    pub diff_highlight_removed: Hsla,
    pub diff_added_bg: Hsla,
    pub diff_removed_bg: Hsla,
    pub diff_context_bg: Hsla,
    pub diff_line_number: Hsla,
    pub diff_added_line_number_bg: Hsla,
    pub diff_removed_line_number_bg: Hsla,

    // Markdown colors
    pub markdown_text: Hsla,
    pub markdown_heading: Hsla,
    pub markdown_link: Hsla,
    pub markdown_link_text: Hsla,
    pub markdown_code: Hsla,
    pub markdown_block_quote: Hsla,
    pub markdown_emph: Hsla,
    pub markdown_strong: Hsla,
    pub markdown_horizontal_rule: Hsla,
    pub markdown_list_item: Hsla,
    pub markdown_list_enumeration: Hsla,
    pub markdown_image: Hsla,
    pub markdown_image_text: Hsla,
    pub markdown_code_block: Hsla,

    // Syntax highlighting
    pub syntax_comment: Hsla,
    pub syntax_keyword: Hsla,
    pub syntax_function: Hsla,
    pub syntax_variable: Hsla,
    pub syntax_string: Hsla,
    pub syntax_number: Hsla,
    pub syntax_type: Hsla,
    pub syntax_operator: Hsla,
    pub syntax_punctuation: Hsla,

    // Persona accents
    pub zee_accent: Hsla,
    pub stanley_accent: Hsla,
    pub johny_accent: Hsla,
}

impl Default for Theme {
    fn default() -> Self {
        themes::opencode_dark()
    }
}

impl Global for Theme {}

// ============================================================================
// Theme Registry
// ============================================================================

/// Registry of all available themes
pub struct ThemeRegistry {
    themes: HashMap<&'static str, fn() -> Theme>,
    theme_list: Vec<ThemeInfo>,
}

/// Basic theme information for UI display
#[derive(Debug, Clone)]
pub struct ThemeInfo {
    pub id: &'static str,
    pub name: &'static str,
    pub is_dark: bool,
}

impl Default for ThemeRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ThemeRegistry {
    pub fn new() -> Self {
        let mut registry = Self {
            themes: HashMap::new(),
            theme_list: Vec::new(),
        };

        // Register all built-in themes
        registry.register("opencode", "OpenCode", true, themes::opencode_dark);
        registry.register("opencode-light", "OpenCode Light", false, themes::opencode_light);
        registry.register("catppuccin", "Catppuccin Mocha", true, themes::catppuccin_mocha);
        registry.register("catppuccin-latte", "Catppuccin Latte", false, themes::catppuccin_latte);
        registry.register("catppuccin-frappe", "Catppuccin Frappe", true, themes::catppuccin_frappe);
        registry.register("catppuccin-macchiato", "Catppuccin Macchiato", true, themes::catppuccin_macchiato);
        registry.register("dracula", "Dracula", true, themes::dracula);
        registry.register("nord", "Nord", true, themes::nord);
        registry.register("nord-light", "Nord Light", false, themes::nord_light);
        registry.register("tokyonight", "Tokyo Night", true, themes::tokyo_night);
        registry.register("tokyonight-light", "Tokyo Night Light", false, themes::tokyo_night_light);
        registry.register("gruvbox", "Gruvbox Dark", true, themes::gruvbox_dark);
        registry.register("gruvbox-light", "Gruvbox Light", false, themes::gruvbox_light);
        registry.register("one-dark", "One Dark", true, themes::one_dark);
        registry.register("github", "GitHub Dark", true, themes::github_dark);
        registry.register("github-light", "GitHub Light", false, themes::github_light);
        registry.register("monokai", "Monokai", true, themes::monokai);
        registry.register("solarized", "Solarized Dark", true, themes::solarized_dark);
        registry.register("solarized-light", "Solarized Light", false, themes::solarized_light);
        registry.register("ayu", "Ayu Dark", true, themes::ayu_dark);
        registry.register("ayu-light", "Ayu Light", false, themes::ayu_light);
        registry.register("material", "Material", true, themes::material);
        registry.register("palenight", "Palenight", true, themes::palenight);
        registry.register("nightowl", "Night Owl", true, themes::night_owl);
        registry.register("synthwave84", "SynthWave '84", true, themes::synthwave84);
        registry.register("rosepine", "Rose Pine", true, themes::rose_pine);
        registry.register("rosepine-light", "Rose Pine Dawn", false, themes::rose_pine_dawn);
        registry.register("vesper", "Vesper", true, themes::vesper);
        registry.register("vercel", "Vercel", true, themes::vercel);
        registry.register("cobalt2", "Cobalt2", true, themes::cobalt2);
        registry.register("flexoki", "Flexoki", true, themes::flexoki);
        registry.register("kanagawa", "Kanagawa", true, themes::kanagawa);
        registry.register("everforest", "Everforest", true, themes::everforest);
        registry.register("matrix", "Matrix", true, themes::matrix);
        registry.register("zenburn", "Zenburn", true, themes::zenburn);

        registry
    }

    fn register(
        &mut self,
        id: &'static str,
        name: &'static str,
        is_dark: bool,
        theme_fn: fn() -> Theme,
    ) {
        self.themes.insert(id, theme_fn);
        self.theme_list.push(ThemeInfo { id, name, is_dark });
    }

    /// Get a theme by ID
    pub fn get(&self, id: &str) -> Option<Theme> {
        self.themes.get(id).map(|f| f())
    }

    /// Get list of all available themes
    pub fn list(&self) -> &[ThemeInfo] {
        &self.theme_list
    }

    /// Get only dark themes
    pub fn dark_themes(&self) -> Vec<&ThemeInfo> {
        self.theme_list.iter().filter(|t| t.is_dark).collect()
    }

    /// Get only light themes
    pub fn light_themes(&self) -> Vec<&ThemeInfo> {
        self.theme_list.iter().filter(|t| !t.is_dark).collect()
    }
}

impl Global for ThemeRegistry {}

// ============================================================================
// Theme Initialization
// ============================================================================

/// Initialize the theme system
pub fn init(cx: &mut App) {
    let registry = ThemeRegistry::new();
    let theme = registry.get("opencode").unwrap_or_default();

    cx.set_global(registry);
    cx.set_global(theme);

    tracing::debug!("Theme system initialized with {} themes", ThemeRegistry::new().list().len());
}

/// Set the current theme by ID
pub fn set_theme_by_id(id: &str, cx: &mut App) {
    let registry = cx.global::<ThemeRegistry>();
    if let Some(theme) = registry.get(id) {
        cx.set_global(theme);
        tracing::info!("Theme changed to: {}", id);
    } else {
        tracing::warn!("Theme not found: {}", id);
    }
}

/// Toggle between light and dark variants of the current theme
pub fn toggle_theme_mode(cx: &mut App) {
    let current = cx.global::<Theme>();
    let current_id = current.id;

    // Try to find the opposite variant
    let new_id = if current_id.ends_with("-light") {
        current_id.trim_end_matches("-light")
    } else {
        // Check if a light variant exists
        let light_id = format!("{}-light", current_id);
        let registry = cx.global::<ThemeRegistry>();
        if registry.get(&light_id).is_some() {
            // Return owned string, we'll handle this differently
            set_theme_by_id(&light_id, cx);
            return;
        }
        // No light variant, just return
        return;
    };

    set_theme_by_id(new_id, cx);
}

/// Get the current theme
pub fn current_theme(cx: &App) -> &Theme {
    cx.global::<Theme>()
}

/// Get the theme registry
pub fn registry(cx: &App) -> &ThemeRegistry {
    cx.global::<ThemeRegistry>()
}
