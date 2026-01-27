//! Built-in theme definitions
//!
//! All themes ported from OpenCode's theme collection.

use super::colors::hex;
use super::Theme;

// ============================================================================
// OpenCode Theme (Default)
// ============================================================================

pub fn opencode_dark() -> Theme {
    Theme {
        id: "opencode",
        name: "OpenCode",
        is_dark: true,

        primary: hex("#fab283"),
        secondary: hex("#5c9cf5"),
        accent: hex("#9d7cd8"),

        error: hex("#e06c75"),
        warning: hex("#f5a742"),
        success: hex("#7fd88f"),
        info: hex("#56b6c2"),

        text: hex("#eeeeee"),
        text_muted: hex("#808080"),

        background: hex("#0a0a0a"),
        background_panel: hex("#141414"),
        background_element: hex("#1e1e1e"),

        border: hex("#484848"),
        border_active: hex("#606060"),
        border_subtle: hex("#3c3c3c"),

        diff_added: hex("#4fd6be"),
        diff_removed: hex("#c53b53"),
        diff_context: hex("#828bb8"),
        diff_hunk_header: hex("#828bb8"),
        diff_highlight_added: hex("#b8db87"),
        diff_highlight_removed: hex("#e26a75"),
        diff_added_bg: hex("#20303b"),
        diff_removed_bg: hex("#37222c"),
        diff_context_bg: hex("#141414"),
        diff_line_number: hex("#1e1e1e"),
        diff_added_line_number_bg: hex("#1b2b34"),
        diff_removed_line_number_bg: hex("#2d1f26"),

        markdown_text: hex("#eeeeee"),
        markdown_heading: hex("#9d7cd8"),
        markdown_link: hex("#fab283"),
        markdown_link_text: hex("#56b6c2"),
        markdown_code: hex("#7fd88f"),
        markdown_block_quote: hex("#e5c07b"),
        markdown_emph: hex("#e5c07b"),
        markdown_strong: hex("#f5a742"),
        markdown_horizontal_rule: hex("#808080"),
        markdown_list_item: hex("#fab283"),
        markdown_list_enumeration: hex("#56b6c2"),
        markdown_image: hex("#fab283"),
        markdown_image_text: hex("#56b6c2"),
        markdown_code_block: hex("#eeeeee"),

        syntax_comment: hex("#808080"),
        syntax_keyword: hex("#9d7cd8"),
        syntax_function: hex("#fab283"),
        syntax_variable: hex("#e06c75"),
        syntax_string: hex("#7fd88f"),
        syntax_number: hex("#f5a742"),
        syntax_type: hex("#e5c07b"),
        syntax_operator: hex("#56b6c2"),
        syntax_punctuation: hex("#eeeeee"),

        zee_accent: hex("#5c9cf5"),
        stanley_accent: hex("#7fd88f"),
        johny_accent: hex("#9d7cd8"),
    }
}

pub fn opencode_light() -> Theme {
    Theme {
        id: "opencode-light",
        name: "OpenCode Light",
        is_dark: false,

        primary: hex("#3b7dd8"),
        secondary: hex("#7b5bb6"),
        accent: hex("#d68c27"),

        error: hex("#d1383d"),
        warning: hex("#d68c27"),
        success: hex("#3d9a57"),
        info: hex("#318795"),

        text: hex("#1a1a1a"),
        text_muted: hex("#8a8a8a"),

        background: hex("#ffffff"),
        background_panel: hex("#fafafa"),
        background_element: hex("#f5f5f5"),

        border: hex("#b8b8b8"),
        border_active: hex("#a0a0a0"),
        border_subtle: hex("#d4d4d4"),

        diff_added: hex("#1e725c"),
        diff_removed: hex("#c53b53"),
        diff_context: hex("#7086b5"),
        diff_hunk_header: hex("#7086b5"),
        diff_highlight_added: hex("#4db380"),
        diff_highlight_removed: hex("#f52a65"),
        diff_added_bg: hex("#d5e5d5"),
        diff_removed_bg: hex("#f7d8db"),
        diff_context_bg: hex("#fafafa"),
        diff_line_number: hex("#f5f5f5"),
        diff_added_line_number_bg: hex("#c5d5c5"),
        diff_removed_line_number_bg: hex("#e7c8cb"),

        markdown_text: hex("#1a1a1a"),
        markdown_heading: hex("#d68c27"),
        markdown_link: hex("#3b7dd8"),
        markdown_link_text: hex("#318795"),
        markdown_code: hex("#3d9a57"),
        markdown_block_quote: hex("#b0851f"),
        markdown_emph: hex("#b0851f"),
        markdown_strong: hex("#d68c27"),
        markdown_horizontal_rule: hex("#8a8a8a"),
        markdown_list_item: hex("#3b7dd8"),
        markdown_list_enumeration: hex("#318795"),
        markdown_image: hex("#3b7dd8"),
        markdown_image_text: hex("#318795"),
        markdown_code_block: hex("#1a1a1a"),

        syntax_comment: hex("#8a8a8a"),
        syntax_keyword: hex("#d68c27"),
        syntax_function: hex("#3b7dd8"),
        syntax_variable: hex("#d1383d"),
        syntax_string: hex("#3d9a57"),
        syntax_number: hex("#d68c27"),
        syntax_type: hex("#b0851f"),
        syntax_operator: hex("#318795"),
        syntax_punctuation: hex("#1a1a1a"),

        zee_accent: hex("#3b7dd8"),
        stanley_accent: hex("#3d9a57"),
        johny_accent: hex("#7b5bb6"),
    }
}

// ============================================================================
// Catppuccin Themes
// ============================================================================

pub fn catppuccin_mocha() -> Theme {
    Theme {
        id: "catppuccin",
        name: "Catppuccin Mocha",
        is_dark: true,

        primary: hex("#89b4fa"),
        secondary: hex("#cba6f7"),
        accent: hex("#f5c2e7"),

        error: hex("#f38ba8"),
        warning: hex("#f9e2af"),
        success: hex("#a6e3a1"),
        info: hex("#94e2d5"),

        text: hex("#cdd6f4"),
        text_muted: hex("#bac2de"),

        background: hex("#1e1e2e"),
        background_panel: hex("#181825"),
        background_element: hex("#11111b"),

        border: hex("#313244"),
        border_active: hex("#45475a"),
        border_subtle: hex("#585b70"),

        diff_added: hex("#a6e3a1"),
        diff_removed: hex("#f38ba8"),
        diff_context: hex("#9399b2"),
        diff_hunk_header: hex("#fab387"),
        diff_highlight_added: hex("#a6e3a1"),
        diff_highlight_removed: hex("#f38ba8"),
        diff_added_bg: hex("#24312b"),
        diff_removed_bg: hex("#3c2a32"),
        diff_context_bg: hex("#181825"),
        diff_line_number: hex("#45475a"),
        diff_added_line_number_bg: hex("#1e2a25"),
        diff_removed_line_number_bg: hex("#32232a"),

        markdown_text: hex("#cdd6f4"),
        markdown_heading: hex("#cba6f7"),
        markdown_link: hex("#89b4fa"),
        markdown_link_text: hex("#89dceb"),
        markdown_code: hex("#a6e3a1"),
        markdown_block_quote: hex("#f9e2af"),
        markdown_emph: hex("#f9e2af"),
        markdown_strong: hex("#fab387"),
        markdown_horizontal_rule: hex("#a6adc8"),
        markdown_list_item: hex("#89b4fa"),
        markdown_list_enumeration: hex("#89dceb"),
        markdown_image: hex("#89b4fa"),
        markdown_image_text: hex("#89dceb"),
        markdown_code_block: hex("#cdd6f4"),

        syntax_comment: hex("#9399b2"),
        syntax_keyword: hex("#cba6f7"),
        syntax_function: hex("#89b4fa"),
        syntax_variable: hex("#f38ba8"),
        syntax_string: hex("#a6e3a1"),
        syntax_number: hex("#fab387"),
        syntax_type: hex("#f9e2af"),
        syntax_operator: hex("#89dceb"),
        syntax_punctuation: hex("#cdd6f4"),

        zee_accent: hex("#89b4fa"),
        stanley_accent: hex("#a6e3a1"),
        johny_accent: hex("#cba6f7"),
    }
}

pub fn catppuccin_latte() -> Theme {
    Theme {
        id: "catppuccin-latte",
        name: "Catppuccin Latte",
        is_dark: false,

        primary: hex("#1e66f5"),
        secondary: hex("#8839ef"),
        accent: hex("#ea76cb"),

        error: hex("#d20f39"),
        warning: hex("#df8e1d"),
        success: hex("#40a02b"),
        info: hex("#179299"),

        text: hex("#4c4f69"),
        text_muted: hex("#5c5f77"),

        background: hex("#eff1f5"),
        background_panel: hex("#e6e9ef"),
        background_element: hex("#dce0e8"),

        border: hex("#ccd0da"),
        border_active: hex("#bcc0cc"),
        border_subtle: hex("#acb0be"),

        diff_added: hex("#40a02b"),
        diff_removed: hex("#d20f39"),
        diff_context: hex("#7c7f93"),
        diff_hunk_header: hex("#fe640b"),
        diff_highlight_added: hex("#40a02b"),
        diff_highlight_removed: hex("#d20f39"),
        diff_added_bg: hex("#d6f0d9"),
        diff_removed_bg: hex("#f6dfe2"),
        diff_context_bg: hex("#e6e9ef"),
        diff_line_number: hex("#bcc0cc"),
        diff_added_line_number_bg: hex("#c9e3cb"),
        diff_removed_line_number_bg: hex("#e9d3d6"),

        markdown_text: hex("#4c4f69"),
        markdown_heading: hex("#8839ef"),
        markdown_link: hex("#1e66f5"),
        markdown_link_text: hex("#04a5e5"),
        markdown_code: hex("#40a02b"),
        markdown_block_quote: hex("#df8e1d"),
        markdown_emph: hex("#df8e1d"),
        markdown_strong: hex("#fe640b"),
        markdown_horizontal_rule: hex("#6c6f85"),
        markdown_list_item: hex("#1e66f5"),
        markdown_list_enumeration: hex("#04a5e5"),
        markdown_image: hex("#1e66f5"),
        markdown_image_text: hex("#04a5e5"),
        markdown_code_block: hex("#4c4f69"),

        syntax_comment: hex("#7c7f93"),
        syntax_keyword: hex("#8839ef"),
        syntax_function: hex("#1e66f5"),
        syntax_variable: hex("#d20f39"),
        syntax_string: hex("#40a02b"),
        syntax_number: hex("#fe640b"),
        syntax_type: hex("#df8e1d"),
        syntax_operator: hex("#04a5e5"),
        syntax_punctuation: hex("#4c4f69"),

        zee_accent: hex("#1e66f5"),
        stanley_accent: hex("#40a02b"),
        johny_accent: hex("#8839ef"),
    }
}

pub fn catppuccin_frappe() -> Theme {
    let mut theme = catppuccin_mocha();
    theme.id = "catppuccin-frappe";
    theme.name = "Catppuccin Frappe";
    theme.background = hex("#303446");
    theme.background_panel = hex("#292c3c");
    theme.background_element = hex("#232634");
    theme.text = hex("#c6d0f5");
    theme.text_muted = hex("#b5bfe2");
    theme
}

pub fn catppuccin_macchiato() -> Theme {
    let mut theme = catppuccin_mocha();
    theme.id = "catppuccin-macchiato";
    theme.name = "Catppuccin Macchiato";
    theme.background = hex("#24273a");
    theme.background_panel = hex("#1e2030");
    theme.background_element = hex("#181926");
    theme.text = hex("#cad3f5");
    theme.text_muted = hex("#b8c0e0");
    theme
}

// ============================================================================
// Dracula Theme
// ============================================================================

pub fn dracula() -> Theme {
    Theme {
        id: "dracula",
        name: "Dracula",
        is_dark: true,

        primary: hex("#bd93f9"),
        secondary: hex("#ff79c6"),
        accent: hex("#8be9fd"),

        error: hex("#ff5555"),
        warning: hex("#f1fa8c"),
        success: hex("#50fa7b"),
        info: hex("#ffb86c"),

        text: hex("#f8f8f2"),
        text_muted: hex("#6272a4"),

        background: hex("#282a36"),
        background_panel: hex("#21222c"),
        background_element: hex("#44475a"),

        border: hex("#44475a"),
        border_active: hex("#bd93f9"),
        border_subtle: hex("#191a21"),

        diff_added: hex("#50fa7b"),
        diff_removed: hex("#ff5555"),
        diff_context: hex("#6272a4"),
        diff_hunk_header: hex("#6272a4"),
        diff_highlight_added: hex("#50fa7b"),
        diff_highlight_removed: hex("#ff5555"),
        diff_added_bg: hex("#1a3a1a"),
        diff_removed_bg: hex("#3a1a1a"),
        diff_context_bg: hex("#21222c"),
        diff_line_number: hex("#44475a"),
        diff_added_line_number_bg: hex("#1a3a1a"),
        diff_removed_line_number_bg: hex("#3a1a1a"),

        markdown_text: hex("#f8f8f2"),
        markdown_heading: hex("#bd93f9"),
        markdown_link: hex("#8be9fd"),
        markdown_link_text: hex("#ff79c6"),
        markdown_code: hex("#50fa7b"),
        markdown_block_quote: hex("#6272a4"),
        markdown_emph: hex("#f1fa8c"),
        markdown_strong: hex("#ffb86c"),
        markdown_horizontal_rule: hex("#6272a4"),
        markdown_list_item: hex("#bd93f9"),
        markdown_list_enumeration: hex("#8be9fd"),
        markdown_image: hex("#8be9fd"),
        markdown_image_text: hex("#ff79c6"),
        markdown_code_block: hex("#f8f8f2"),

        syntax_comment: hex("#6272a4"),
        syntax_keyword: hex("#ff79c6"),
        syntax_function: hex("#50fa7b"),
        syntax_variable: hex("#f8f8f2"),
        syntax_string: hex("#f1fa8c"),
        syntax_number: hex("#bd93f9"),
        syntax_type: hex("#8be9fd"),
        syntax_operator: hex("#ff79c6"),
        syntax_punctuation: hex("#f8f8f2"),

        zee_accent: hex("#8be9fd"),
        stanley_accent: hex("#50fa7b"),
        johny_accent: hex("#bd93f9"),
    }
}

// ============================================================================
// Nord Theme
// ============================================================================

pub fn nord() -> Theme {
    Theme {
        id: "nord",
        name: "Nord",
        is_dark: true,

        primary: hex("#88C0D0"),
        secondary: hex("#81A1C1"),
        accent: hex("#8FBCBB"),

        error: hex("#BF616A"),
        warning: hex("#D08770"),
        success: hex("#A3BE8C"),
        info: hex("#88C0D0"),

        text: hex("#ECEFF4"),
        text_muted: hex("#8B95A7"),

        background: hex("#2E3440"),
        background_panel: hex("#3B4252"),
        background_element: hex("#434C5E"),

        border: hex("#434C5E"),
        border_active: hex("#4C566A"),
        border_subtle: hex("#434C5E"),

        diff_added: hex("#A3BE8C"),
        diff_removed: hex("#BF616A"),
        diff_context: hex("#8B95A7"),
        diff_hunk_header: hex("#8B95A7"),
        diff_highlight_added: hex("#A3BE8C"),
        diff_highlight_removed: hex("#BF616A"),
        diff_added_bg: hex("#3B4252"),
        diff_removed_bg: hex("#3B4252"),
        diff_context_bg: hex("#3B4252"),
        diff_line_number: hex("#434C5E"),
        diff_added_line_number_bg: hex("#3B4252"),
        diff_removed_line_number_bg: hex("#3B4252"),

        markdown_text: hex("#D8DEE9"),
        markdown_heading: hex("#88C0D0"),
        markdown_link: hex("#81A1C1"),
        markdown_link_text: hex("#8FBCBB"),
        markdown_code: hex("#A3BE8C"),
        markdown_block_quote: hex("#8B95A7"),
        markdown_emph: hex("#D08770"),
        markdown_strong: hex("#EBCB8B"),
        markdown_horizontal_rule: hex("#8B95A7"),
        markdown_list_item: hex("#88C0D0"),
        markdown_list_enumeration: hex("#8FBCBB"),
        markdown_image: hex("#81A1C1"),
        markdown_image_text: hex("#8FBCBB"),
        markdown_code_block: hex("#D8DEE9"),

        syntax_comment: hex("#8B95A7"),
        syntax_keyword: hex("#81A1C1"),
        syntax_function: hex("#88C0D0"),
        syntax_variable: hex("#8FBCBB"),
        syntax_string: hex("#A3BE8C"),
        syntax_number: hex("#B48EAD"),
        syntax_type: hex("#8FBCBB"),
        syntax_operator: hex("#81A1C1"),
        syntax_punctuation: hex("#D8DEE9"),

        zee_accent: hex("#88C0D0"),
        stanley_accent: hex("#A3BE8C"),
        johny_accent: hex("#B48EAD"),
    }
}

pub fn nord_light() -> Theme {
    Theme {
        id: "nord-light",
        name: "Nord Light",
        is_dark: false,

        primary: hex("#5E81AC"),
        secondary: hex("#81A1C1"),
        accent: hex("#8FBCBB"),

        error: hex("#BF616A"),
        warning: hex("#D08770"),
        success: hex("#A3BE8C"),
        info: hex("#5E81AC"),

        text: hex("#2E3440"),
        text_muted: hex("#3B4252"),

        background: hex("#ECEFF4"),
        background_panel: hex("#E5E9F0"),
        background_element: hex("#D8DEE9"),

        border: hex("#4C566A"),
        border_active: hex("#434C5E"),
        border_subtle: hex("#4C566A"),

        ..nord()
    }
}

// ============================================================================
// Tokyo Night Theme
// ============================================================================

pub fn tokyo_night() -> Theme {
    Theme {
        id: "tokyonight",
        name: "Tokyo Night",
        is_dark: true,

        primary: hex("#82aaff"),
        secondary: hex("#c099ff"),
        accent: hex("#ff966c"),

        error: hex("#ff757f"),
        warning: hex("#ff966c"),
        success: hex("#c3e88d"),
        info: hex("#82aaff"),

        text: hex("#c8d3f5"),
        text_muted: hex("#828bb8"),

        background: hex("#1a1b26"),
        background_panel: hex("#1e2030"),
        background_element: hex("#222436"),

        border: hex("#737aa2"),
        border_active: hex("#9099b2"),
        border_subtle: hex("#545c7e"),

        diff_added: hex("#4fd6be"),
        diff_removed: hex("#c53b53"),
        diff_context: hex("#828bb8"),
        diff_hunk_header: hex("#828bb8"),
        diff_highlight_added: hex("#b8db87"),
        diff_highlight_removed: hex("#e26a75"),
        diff_added_bg: hex("#20303b"),
        diff_removed_bg: hex("#37222c"),
        diff_context_bg: hex("#1e2030"),
        diff_line_number: hex("#222436"),
        diff_added_line_number_bg: hex("#1b2b34"),
        diff_removed_line_number_bg: hex("#2d1f26"),

        markdown_text: hex("#c8d3f5"),
        markdown_heading: hex("#c099ff"),
        markdown_link: hex("#82aaff"),
        markdown_link_text: hex("#86e1fc"),
        markdown_code: hex("#c3e88d"),
        markdown_block_quote: hex("#ffc777"),
        markdown_emph: hex("#ffc777"),
        markdown_strong: hex("#ff966c"),
        markdown_horizontal_rule: hex("#828bb8"),
        markdown_list_item: hex("#82aaff"),
        markdown_list_enumeration: hex("#86e1fc"),
        markdown_image: hex("#82aaff"),
        markdown_image_text: hex("#86e1fc"),
        markdown_code_block: hex("#c8d3f5"),

        syntax_comment: hex("#828bb8"),
        syntax_keyword: hex("#c099ff"),
        syntax_function: hex("#82aaff"),
        syntax_variable: hex("#ff757f"),
        syntax_string: hex("#c3e88d"),
        syntax_number: hex("#ff966c"),
        syntax_type: hex("#ffc777"),
        syntax_operator: hex("#86e1fc"),
        syntax_punctuation: hex("#c8d3f5"),

        zee_accent: hex("#82aaff"),
        stanley_accent: hex("#c3e88d"),
        johny_accent: hex("#c099ff"),
    }
}

pub fn tokyo_night_light() -> Theme {
    Theme {
        id: "tokyonight-light",
        name: "Tokyo Night Light",
        is_dark: false,

        primary: hex("#2e7de9"),
        secondary: hex("#9854f1"),
        accent: hex("#b15c00"),

        error: hex("#f52a65"),
        warning: hex("#b15c00"),
        success: hex("#587539"),
        info: hex("#2e7de9"),

        text: hex("#3760bf"),
        text_muted: hex("#8990a3"),

        background: hex("#e1e2e7"),
        background_panel: hex("#d5d6db"),
        background_element: hex("#c8c9ce"),

        border: hex("#737a8c"),
        border_active: hex("#5a607d"),
        border_subtle: hex("#9699a8"),

        ..tokyo_night()
    }
}

// ============================================================================
// Gruvbox Theme
// ============================================================================

pub fn gruvbox_dark() -> Theme {
    Theme {
        id: "gruvbox",
        name: "Gruvbox Dark",
        is_dark: true,

        primary: hex("#fabd2f"),
        secondary: hex("#83a598"),
        accent: hex("#d3869b"),

        error: hex("#fb4934"),
        warning: hex("#fe8019"),
        success: hex("#b8bb26"),
        info: hex("#83a598"),

        text: hex("#ebdbb2"),
        text_muted: hex("#928374"),

        background: hex("#282828"),
        background_panel: hex("#1d2021"),
        background_element: hex("#3c3836"),

        border: hex("#504945"),
        border_active: hex("#665c54"),
        border_subtle: hex("#3c3836"),

        diff_added: hex("#b8bb26"),
        diff_removed: hex("#fb4934"),
        diff_context: hex("#928374"),
        diff_hunk_header: hex("#928374"),
        diff_highlight_added: hex("#b8bb26"),
        diff_highlight_removed: hex("#fb4934"),
        diff_added_bg: hex("#2b3328"),
        diff_removed_bg: hex("#3c2828"),
        diff_context_bg: hex("#1d2021"),
        diff_line_number: hex("#3c3836"),
        diff_added_line_number_bg: hex("#2b3328"),
        diff_removed_line_number_bg: hex("#3c2828"),

        markdown_text: hex("#ebdbb2"),
        markdown_heading: hex("#fabd2f"),
        markdown_link: hex("#83a598"),
        markdown_link_text: hex("#8ec07c"),
        markdown_code: hex("#b8bb26"),
        markdown_block_quote: hex("#928374"),
        markdown_emph: hex("#fabd2f"),
        markdown_strong: hex("#fe8019"),
        markdown_horizontal_rule: hex("#928374"),
        markdown_list_item: hex("#fabd2f"),
        markdown_list_enumeration: hex("#83a598"),
        markdown_image: hex("#83a598"),
        markdown_image_text: hex("#8ec07c"),
        markdown_code_block: hex("#ebdbb2"),

        syntax_comment: hex("#928374"),
        syntax_keyword: hex("#fb4934"),
        syntax_function: hex("#b8bb26"),
        syntax_variable: hex("#83a598"),
        syntax_string: hex("#b8bb26"),
        syntax_number: hex("#d3869b"),
        syntax_type: hex("#fabd2f"),
        syntax_operator: hex("#8ec07c"),
        syntax_punctuation: hex("#ebdbb2"),

        zee_accent: hex("#83a598"),
        stanley_accent: hex("#b8bb26"),
        johny_accent: hex("#d3869b"),
    }
}

pub fn gruvbox_light() -> Theme {
    Theme {
        id: "gruvbox-light",
        name: "Gruvbox Light",
        is_dark: false,

        primary: hex("#b57614"),
        secondary: hex("#076678"),
        accent: hex("#8f3f71"),

        error: hex("#9d0006"),
        warning: hex("#af3a03"),
        success: hex("#79740e"),
        info: hex("#076678"),

        text: hex("#3c3836"),
        text_muted: hex("#7c6f64"),

        background: hex("#fbf1c7"),
        background_panel: hex("#f2e5bc"),
        background_element: hex("#ebdbb2"),

        border: hex("#bdae93"),
        border_active: hex("#a89984"),
        border_subtle: hex("#d5c4a1"),

        ..gruvbox_dark()
    }
}

// ============================================================================
// One Dark Theme
// ============================================================================

pub fn one_dark() -> Theme {
    Theme {
        id: "one-dark",
        name: "One Dark",
        is_dark: true,

        primary: hex("#61afef"),
        secondary: hex("#c678dd"),
        accent: hex("#e5c07b"),

        error: hex("#e06c75"),
        warning: hex("#e5c07b"),
        success: hex("#98c379"),
        info: hex("#56b6c2"),

        text: hex("#abb2bf"),
        text_muted: hex("#5c6370"),

        background: hex("#282c34"),
        background_panel: hex("#21252b"),
        background_element: hex("#2c313c"),

        border: hex("#3e4451"),
        border_active: hex("#4b5263"),
        border_subtle: hex("#323842"),

        diff_added: hex("#98c379"),
        diff_removed: hex("#e06c75"),
        diff_context: hex("#5c6370"),
        diff_hunk_header: hex("#5c6370"),
        diff_highlight_added: hex("#98c379"),
        diff_highlight_removed: hex("#e06c75"),
        diff_added_bg: hex("#283428"),
        diff_removed_bg: hex("#3c2828"),
        diff_context_bg: hex("#21252b"),
        diff_line_number: hex("#2c313c"),
        diff_added_line_number_bg: hex("#283428"),
        diff_removed_line_number_bg: hex("#3c2828"),

        markdown_text: hex("#abb2bf"),
        markdown_heading: hex("#c678dd"),
        markdown_link: hex("#61afef"),
        markdown_link_text: hex("#56b6c2"),
        markdown_code: hex("#98c379"),
        markdown_block_quote: hex("#5c6370"),
        markdown_emph: hex("#e5c07b"),
        markdown_strong: hex("#d19a66"),
        markdown_horizontal_rule: hex("#5c6370"),
        markdown_list_item: hex("#61afef"),
        markdown_list_enumeration: hex("#56b6c2"),
        markdown_image: hex("#61afef"),
        markdown_image_text: hex("#56b6c2"),
        markdown_code_block: hex("#abb2bf"),

        syntax_comment: hex("#5c6370"),
        syntax_keyword: hex("#c678dd"),
        syntax_function: hex("#61afef"),
        syntax_variable: hex("#e06c75"),
        syntax_string: hex("#98c379"),
        syntax_number: hex("#d19a66"),
        syntax_type: hex("#e5c07b"),
        syntax_operator: hex("#56b6c2"),
        syntax_punctuation: hex("#abb2bf"),

        zee_accent: hex("#61afef"),
        stanley_accent: hex("#98c379"),
        johny_accent: hex("#c678dd"),
    }
}

// ============================================================================
// GitHub Theme
// ============================================================================

pub fn github_dark() -> Theme {
    Theme {
        id: "github",
        name: "GitHub Dark",
        is_dark: true,

        primary: hex("#58a6ff"),
        secondary: hex("#bc8cff"),
        accent: hex("#f78166"),

        error: hex("#f85149"),
        warning: hex("#d29922"),
        success: hex("#3fb950"),
        info: hex("#58a6ff"),

        text: hex("#c9d1d9"),
        text_muted: hex("#8b949e"),

        background: hex("#0d1117"),
        background_panel: hex("#161b22"),
        background_element: hex("#21262d"),

        border: hex("#30363d"),
        border_active: hex("#484f58"),
        border_subtle: hex("#21262d"),

        diff_added: hex("#3fb950"),
        diff_removed: hex("#f85149"),
        diff_context: hex("#8b949e"),
        diff_hunk_header: hex("#8b949e"),
        diff_highlight_added: hex("#3fb950"),
        diff_highlight_removed: hex("#f85149"),
        diff_added_bg: hex("#1b3428"),
        diff_removed_bg: hex("#3c2828"),
        diff_context_bg: hex("#161b22"),
        diff_line_number: hex("#21262d"),
        diff_added_line_number_bg: hex("#1b3428"),
        diff_removed_line_number_bg: hex("#3c2828"),

        markdown_text: hex("#c9d1d9"),
        markdown_heading: hex("#58a6ff"),
        markdown_link: hex("#58a6ff"),
        markdown_link_text: hex("#a5d6ff"),
        markdown_code: hex("#79c0ff"),
        markdown_block_quote: hex("#8b949e"),
        markdown_emph: hex("#d29922"),
        markdown_strong: hex("#f78166"),
        markdown_horizontal_rule: hex("#8b949e"),
        markdown_list_item: hex("#58a6ff"),
        markdown_list_enumeration: hex("#a5d6ff"),
        markdown_image: hex("#58a6ff"),
        markdown_image_text: hex("#a5d6ff"),
        markdown_code_block: hex("#c9d1d9"),

        syntax_comment: hex("#8b949e"),
        syntax_keyword: hex("#ff7b72"),
        syntax_function: hex("#d2a8ff"),
        syntax_variable: hex("#ffa657"),
        syntax_string: hex("#a5d6ff"),
        syntax_number: hex("#79c0ff"),
        syntax_type: hex("#7ee787"),
        syntax_operator: hex("#ff7b72"),
        syntax_punctuation: hex("#c9d1d9"),

        zee_accent: hex("#58a6ff"),
        stanley_accent: hex("#3fb950"),
        johny_accent: hex("#bc8cff"),
    }
}

pub fn github_light() -> Theme {
    Theme {
        id: "github-light",
        name: "GitHub Light",
        is_dark: false,

        primary: hex("#0969da"),
        secondary: hex("#8250df"),
        accent: hex("#cf222e"),

        error: hex("#cf222e"),
        warning: hex("#9a6700"),
        success: hex("#1a7f37"),
        info: hex("#0969da"),

        text: hex("#24292f"),
        text_muted: hex("#57606a"),

        background: hex("#ffffff"),
        background_panel: hex("#f6f8fa"),
        background_element: hex("#eaeef2"),

        border: hex("#d0d7de"),
        border_active: hex("#8c959f"),
        border_subtle: hex("#eaeef2"),

        ..github_dark()
    }
}

// ============================================================================
// Monokai Theme
// ============================================================================

pub fn monokai() -> Theme {
    Theme {
        id: "monokai",
        name: "Monokai",
        is_dark: true,

        primary: hex("#66d9ef"),
        secondary: hex("#ae81ff"),
        accent: hex("#fd971f"),

        error: hex("#f92672"),
        warning: hex("#fd971f"),
        success: hex("#a6e22e"),
        info: hex("#66d9ef"),

        text: hex("#f8f8f2"),
        text_muted: hex("#75715e"),

        background: hex("#272822"),
        background_panel: hex("#1e1f1c"),
        background_element: hex("#3e3d32"),

        border: hex("#3e3d32"),
        border_active: hex("#49483e"),
        border_subtle: hex("#3e3d32"),

        diff_added: hex("#a6e22e"),
        diff_removed: hex("#f92672"),
        diff_context: hex("#75715e"),
        diff_hunk_header: hex("#75715e"),
        diff_highlight_added: hex("#a6e22e"),
        diff_highlight_removed: hex("#f92672"),
        diff_added_bg: hex("#2a3522"),
        diff_removed_bg: hex("#3c2228"),
        diff_context_bg: hex("#1e1f1c"),
        diff_line_number: hex("#3e3d32"),
        diff_added_line_number_bg: hex("#2a3522"),
        diff_removed_line_number_bg: hex("#3c2228"),

        markdown_text: hex("#f8f8f2"),
        markdown_heading: hex("#ae81ff"),
        markdown_link: hex("#66d9ef"),
        markdown_link_text: hex("#a6e22e"),
        markdown_code: hex("#a6e22e"),
        markdown_block_quote: hex("#75715e"),
        markdown_emph: hex("#e6db74"),
        markdown_strong: hex("#fd971f"),
        markdown_horizontal_rule: hex("#75715e"),
        markdown_list_item: hex("#66d9ef"),
        markdown_list_enumeration: hex("#ae81ff"),
        markdown_image: hex("#66d9ef"),
        markdown_image_text: hex("#a6e22e"),
        markdown_code_block: hex("#f8f8f2"),

        syntax_comment: hex("#75715e"),
        syntax_keyword: hex("#f92672"),
        syntax_function: hex("#a6e22e"),
        syntax_variable: hex("#f8f8f2"),
        syntax_string: hex("#e6db74"),
        syntax_number: hex("#ae81ff"),
        syntax_type: hex("#66d9ef"),
        syntax_operator: hex("#f92672"),
        syntax_punctuation: hex("#f8f8f2"),

        zee_accent: hex("#66d9ef"),
        stanley_accent: hex("#a6e22e"),
        johny_accent: hex("#ae81ff"),
    }
}

// ============================================================================
// Solarized Theme
// ============================================================================

pub fn solarized_dark() -> Theme {
    Theme {
        id: "solarized",
        name: "Solarized Dark",
        is_dark: true,

        primary: hex("#268bd2"),
        secondary: hex("#6c71c4"),
        accent: hex("#cb4b16"),

        error: hex("#dc322f"),
        warning: hex("#b58900"),
        success: hex("#859900"),
        info: hex("#2aa198"),

        text: hex("#839496"),
        text_muted: hex("#586e75"),

        background: hex("#002b36"),
        background_panel: hex("#073642"),
        background_element: hex("#094959"),

        border: hex("#094959"),
        border_active: hex("#586e75"),
        border_subtle: hex("#073642"),

        diff_added: hex("#859900"),
        diff_removed: hex("#dc322f"),
        diff_context: hex("#586e75"),
        diff_hunk_header: hex("#586e75"),
        diff_highlight_added: hex("#859900"),
        diff_highlight_removed: hex("#dc322f"),
        diff_added_bg: hex("#1a2b22"),
        diff_removed_bg: hex("#2b1a1a"),
        diff_context_bg: hex("#073642"),
        diff_line_number: hex("#094959"),
        diff_added_line_number_bg: hex("#1a2b22"),
        diff_removed_line_number_bg: hex("#2b1a1a"),

        markdown_text: hex("#839496"),
        markdown_heading: hex("#268bd2"),
        markdown_link: hex("#268bd2"),
        markdown_link_text: hex("#2aa198"),
        markdown_code: hex("#859900"),
        markdown_block_quote: hex("#586e75"),
        markdown_emph: hex("#b58900"),
        markdown_strong: hex("#cb4b16"),
        markdown_horizontal_rule: hex("#586e75"),
        markdown_list_item: hex("#268bd2"),
        markdown_list_enumeration: hex("#2aa198"),
        markdown_image: hex("#268bd2"),
        markdown_image_text: hex("#2aa198"),
        markdown_code_block: hex("#839496"),

        syntax_comment: hex("#586e75"),
        syntax_keyword: hex("#859900"),
        syntax_function: hex("#268bd2"),
        syntax_variable: hex("#b58900"),
        syntax_string: hex("#2aa198"),
        syntax_number: hex("#d33682"),
        syntax_type: hex("#b58900"),
        syntax_operator: hex("#859900"),
        syntax_punctuation: hex("#839496"),

        zee_accent: hex("#268bd2"),
        stanley_accent: hex("#859900"),
        johny_accent: hex("#6c71c4"),
    }
}

pub fn solarized_light() -> Theme {
    Theme {
        id: "solarized-light",
        name: "Solarized Light",
        is_dark: false,

        text: hex("#657b83"),
        text_muted: hex("#93a1a1"),

        background: hex("#fdf6e3"),
        background_panel: hex("#eee8d5"),
        background_element: hex("#e8e2cf"),

        border: hex("#e8e2cf"),
        border_active: hex("#93a1a1"),
        border_subtle: hex("#eee8d5"),

        ..solarized_dark()
    }
}

// ============================================================================
// Ayu Theme
// ============================================================================

pub fn ayu_dark() -> Theme {
    Theme {
        id: "ayu",
        name: "Ayu Dark",
        is_dark: true,

        primary: hex("#e6b450"),
        secondary: hex("#ffb454"),
        accent: hex("#59c2ff"),

        error: hex("#f07178"),
        warning: hex("#ffb454"),
        success: hex("#aad94c"),
        info: hex("#59c2ff"),

        text: hex("#bfbdb6"),
        text_muted: hex("#636d83"),

        background: hex("#0d1017"),
        background_panel: hex("#0f131a"),
        background_element: hex("#131721"),

        border: hex("#1c222d"),
        border_active: hex("#2d3441"),
        border_subtle: hex("#1c222d"),

        diff_added: hex("#aad94c"),
        diff_removed: hex("#f07178"),
        diff_context: hex("#636d83"),
        diff_hunk_header: hex("#636d83"),
        diff_highlight_added: hex("#aad94c"),
        diff_highlight_removed: hex("#f07178"),
        diff_added_bg: hex("#1a2b22"),
        diff_removed_bg: hex("#2b1a1a"),
        diff_context_bg: hex("#0f131a"),
        diff_line_number: hex("#131721"),
        diff_added_line_number_bg: hex("#1a2b22"),
        diff_removed_line_number_bg: hex("#2b1a1a"),

        markdown_text: hex("#bfbdb6"),
        markdown_heading: hex("#e6b450"),
        markdown_link: hex("#59c2ff"),
        markdown_link_text: hex("#95e6cb"),
        markdown_code: hex("#aad94c"),
        markdown_block_quote: hex("#636d83"),
        markdown_emph: hex("#ffb454"),
        markdown_strong: hex("#f29668"),
        markdown_horizontal_rule: hex("#636d83"),
        markdown_list_item: hex("#e6b450"),
        markdown_list_enumeration: hex("#59c2ff"),
        markdown_image: hex("#59c2ff"),
        markdown_image_text: hex("#95e6cb"),
        markdown_code_block: hex("#bfbdb6"),

        syntax_comment: hex("#636d83"),
        syntax_keyword: hex("#ff8f40"),
        syntax_function: hex("#ffb454"),
        syntax_variable: hex("#bfbdb6"),
        syntax_string: hex("#aad94c"),
        syntax_number: hex("#e6b450"),
        syntax_type: hex("#59c2ff"),
        syntax_operator: hex("#f29668"),
        syntax_punctuation: hex("#bfbdb6"),

        zee_accent: hex("#59c2ff"),
        stanley_accent: hex("#aad94c"),
        johny_accent: hex("#e6b450"),
    }
}

pub fn ayu_light() -> Theme {
    Theme {
        id: "ayu-light",
        name: "Ayu Light",
        is_dark: false,

        text: hex("#5c6166"),
        text_muted: hex("#8a9199"),

        background: hex("#fcfcfc"),
        background_panel: hex("#f8f8f8"),
        background_element: hex("#f3f3f3"),

        border: hex("#e4e4e4"),
        border_active: hex("#c8c8c8"),
        border_subtle: hex("#eaeaea"),

        ..ayu_dark()
    }
}

// ============================================================================
// Material Theme
// ============================================================================

pub fn material() -> Theme {
    Theme {
        id: "material",
        name: "Material",
        is_dark: true,

        primary: hex("#82aaff"),
        secondary: hex("#c792ea"),
        accent: hex("#ffcb6b"),

        error: hex("#f07178"),
        warning: hex("#ffcb6b"),
        success: hex("#c3e88d"),
        info: hex("#89ddff"),

        text: hex("#eeffff"),
        text_muted: hex("#546e7a"),

        background: hex("#263238"),
        background_panel: hex("#1e282d"),
        background_element: hex("#2c3b41"),

        border: hex("#37474f"),
        border_active: hex("#546e7a"),
        border_subtle: hex("#2c3b41"),

        diff_added: hex("#c3e88d"),
        diff_removed: hex("#f07178"),
        diff_context: hex("#546e7a"),
        diff_hunk_header: hex("#546e7a"),
        diff_highlight_added: hex("#c3e88d"),
        diff_highlight_removed: hex("#f07178"),
        diff_added_bg: hex("#1e3422"),
        diff_removed_bg: hex("#3c2222"),
        diff_context_bg: hex("#1e282d"),
        diff_line_number: hex("#2c3b41"),
        diff_added_line_number_bg: hex("#1e3422"),
        diff_removed_line_number_bg: hex("#3c2222"),

        markdown_text: hex("#eeffff"),
        markdown_heading: hex("#c792ea"),
        markdown_link: hex("#82aaff"),
        markdown_link_text: hex("#89ddff"),
        markdown_code: hex("#c3e88d"),
        markdown_block_quote: hex("#546e7a"),
        markdown_emph: hex("#ffcb6b"),
        markdown_strong: hex("#f78c6c"),
        markdown_horizontal_rule: hex("#546e7a"),
        markdown_list_item: hex("#82aaff"),
        markdown_list_enumeration: hex("#89ddff"),
        markdown_image: hex("#82aaff"),
        markdown_image_text: hex("#89ddff"),
        markdown_code_block: hex("#eeffff"),

        syntax_comment: hex("#546e7a"),
        syntax_keyword: hex("#c792ea"),
        syntax_function: hex("#82aaff"),
        syntax_variable: hex("#f07178"),
        syntax_string: hex("#c3e88d"),
        syntax_number: hex("#f78c6c"),
        syntax_type: hex("#ffcb6b"),
        syntax_operator: hex("#89ddff"),
        syntax_punctuation: hex("#eeffff"),

        zee_accent: hex("#82aaff"),
        stanley_accent: hex("#c3e88d"),
        johny_accent: hex("#c792ea"),
    }
}

// ============================================================================
// Palenight Theme
// ============================================================================

pub fn palenight() -> Theme {
    Theme {
        id: "palenight",
        name: "Palenight",
        is_dark: true,

        primary: hex("#82aaff"),
        secondary: hex("#c792ea"),
        accent: hex("#f78c6c"),

        error: hex("#ff5370"),
        warning: hex("#ffcb6b"),
        success: hex("#c3e88d"),
        info: hex("#89ddff"),

        text: hex("#a6accd"),
        text_muted: hex("#676e95"),

        background: hex("#292d3e"),
        background_panel: hex("#1b1e2b"),
        background_element: hex("#32374c"),

        border: hex("#3a3f58"),
        border_active: hex("#4e5579"),
        border_subtle: hex("#32374c"),

        diff_added: hex("#c3e88d"),
        diff_removed: hex("#ff5370"),
        diff_context: hex("#676e95"),
        diff_hunk_header: hex("#676e95"),
        diff_highlight_added: hex("#c3e88d"),
        diff_highlight_removed: hex("#ff5370"),
        diff_added_bg: hex("#1e2e22"),
        diff_removed_bg: hex("#3c2228"),
        diff_context_bg: hex("#1b1e2b"),
        diff_line_number: hex("#32374c"),
        diff_added_line_number_bg: hex("#1e2e22"),
        diff_removed_line_number_bg: hex("#3c2228"),

        markdown_text: hex("#a6accd"),
        markdown_heading: hex("#c792ea"),
        markdown_link: hex("#82aaff"),
        markdown_link_text: hex("#89ddff"),
        markdown_code: hex("#c3e88d"),
        markdown_block_quote: hex("#676e95"),
        markdown_emph: hex("#ffcb6b"),
        markdown_strong: hex("#f78c6c"),
        markdown_horizontal_rule: hex("#676e95"),
        markdown_list_item: hex("#82aaff"),
        markdown_list_enumeration: hex("#89ddff"),
        markdown_image: hex("#82aaff"),
        markdown_image_text: hex("#89ddff"),
        markdown_code_block: hex("#a6accd"),

        syntax_comment: hex("#676e95"),
        syntax_keyword: hex("#c792ea"),
        syntax_function: hex("#82aaff"),
        syntax_variable: hex("#ff5370"),
        syntax_string: hex("#c3e88d"),
        syntax_number: hex("#f78c6c"),
        syntax_type: hex("#ffcb6b"),
        syntax_operator: hex("#89ddff"),
        syntax_punctuation: hex("#a6accd"),

        zee_accent: hex("#82aaff"),
        stanley_accent: hex("#c3e88d"),
        johny_accent: hex("#c792ea"),
    }
}

// ============================================================================
// Night Owl Theme
// ============================================================================

pub fn night_owl() -> Theme {
    Theme {
        id: "nightowl",
        name: "Night Owl",
        is_dark: true,

        primary: hex("#82aaff"),
        secondary: hex("#c792ea"),
        accent: hex("#f78c6c"),

        error: hex("#ef5350"),
        warning: hex("#ffcb6b"),
        success: hex("#22da6e"),
        info: hex("#7fdbca"),

        text: hex("#d6deeb"),
        text_muted: hex("#637777"),

        background: hex("#011627"),
        background_panel: hex("#0b2942"),
        background_element: hex("#0e3a5a"),

        border: hex("#1d3b53"),
        border_active: hex("#5f7e97"),
        border_subtle: hex("#122d42"),

        diff_added: hex("#22da6e"),
        diff_removed: hex("#ef5350"),
        diff_context: hex("#637777"),
        diff_hunk_header: hex("#637777"),
        diff_highlight_added: hex("#22da6e"),
        diff_highlight_removed: hex("#ef5350"),
        diff_added_bg: hex("#0a2a22"),
        diff_removed_bg: hex("#2a0a0a"),
        diff_context_bg: hex("#0b2942"),
        diff_line_number: hex("#0e3a5a"),
        diff_added_line_number_bg: hex("#0a2a22"),
        diff_removed_line_number_bg: hex("#2a0a0a"),

        markdown_text: hex("#d6deeb"),
        markdown_heading: hex("#c792ea"),
        markdown_link: hex("#82aaff"),
        markdown_link_text: hex("#7fdbca"),
        markdown_code: hex("#22da6e"),
        markdown_block_quote: hex("#637777"),
        markdown_emph: hex("#ffcb6b"),
        markdown_strong: hex("#f78c6c"),
        markdown_horizontal_rule: hex("#637777"),
        markdown_list_item: hex("#82aaff"),
        markdown_list_enumeration: hex("#7fdbca"),
        markdown_image: hex("#82aaff"),
        markdown_image_text: hex("#7fdbca"),
        markdown_code_block: hex("#d6deeb"),

        syntax_comment: hex("#637777"),
        syntax_keyword: hex("#c792ea"),
        syntax_function: hex("#82aaff"),
        syntax_variable: hex("#d6deeb"),
        syntax_string: hex("#ecc48d"),
        syntax_number: hex("#f78c6c"),
        syntax_type: hex("#ffcb6b"),
        syntax_operator: hex("#7fdbca"),
        syntax_punctuation: hex("#d6deeb"),

        zee_accent: hex("#82aaff"),
        stanley_accent: hex("#22da6e"),
        johny_accent: hex("#c792ea"),
    }
}

// ============================================================================
// SynthWave '84 Theme
// ============================================================================

pub fn synthwave84() -> Theme {
    Theme {
        id: "synthwave84",
        name: "SynthWave '84",
        is_dark: true,

        primary: hex("#ff7edb"),
        secondary: hex("#b893ce"),
        accent: hex("#72f1b8"),

        error: hex("#fe4450"),
        warning: hex("#fede5d"),
        success: hex("#72f1b8"),
        info: hex("#36f9f6"),

        text: hex("#ffffff"),
        text_muted: hex("#848bbd"),

        background: hex("#262335"),
        background_panel: hex("#1e1a2e"),
        background_element: hex("#34294f"),

        border: hex("#495495"),
        border_active: hex("#ff7edb"),
        border_subtle: hex("#34294f"),

        diff_added: hex("#72f1b8"),
        diff_removed: hex("#fe4450"),
        diff_context: hex("#848bbd"),
        diff_hunk_header: hex("#848bbd"),
        diff_highlight_added: hex("#72f1b8"),
        diff_highlight_removed: hex("#fe4450"),
        diff_added_bg: hex("#1a3a2a"),
        diff_removed_bg: hex("#3a1a1a"),
        diff_context_bg: hex("#1e1a2e"),
        diff_line_number: hex("#34294f"),
        diff_added_line_number_bg: hex("#1a3a2a"),
        diff_removed_line_number_bg: hex("#3a1a1a"),

        markdown_text: hex("#ffffff"),
        markdown_heading: hex("#ff7edb"),
        markdown_link: hex("#36f9f6"),
        markdown_link_text: hex("#72f1b8"),
        markdown_code: hex("#72f1b8"),
        markdown_block_quote: hex("#848bbd"),
        markdown_emph: hex("#fede5d"),
        markdown_strong: hex("#f97e72"),
        markdown_horizontal_rule: hex("#848bbd"),
        markdown_list_item: hex("#ff7edb"),
        markdown_list_enumeration: hex("#36f9f6"),
        markdown_image: hex("#36f9f6"),
        markdown_image_text: hex("#72f1b8"),
        markdown_code_block: hex("#ffffff"),

        syntax_comment: hex("#848bbd"),
        syntax_keyword: hex("#fede5d"),
        syntax_function: hex("#36f9f6"),
        syntax_variable: hex("#ff7edb"),
        syntax_string: hex("#ff8b39"),
        syntax_number: hex("#f97e72"),
        syntax_type: hex("#72f1b8"),
        syntax_operator: hex("#36f9f6"),
        syntax_punctuation: hex("#ffffff"),

        zee_accent: hex("#36f9f6"),
        stanley_accent: hex("#72f1b8"),
        johny_accent: hex("#ff7edb"),
    }
}

// ============================================================================
// Rose Pine Theme
// ============================================================================

pub fn rose_pine() -> Theme {
    Theme {
        id: "rosepine",
        name: "Rose Pine",
        is_dark: true,

        primary: hex("#ebbcba"),
        secondary: hex("#c4a7e7"),
        accent: hex("#f6c177"),

        error: hex("#eb6f92"),
        warning: hex("#f6c177"),
        success: hex("#31748f"),
        info: hex("#9ccfd8"),

        text: hex("#e0def4"),
        text_muted: hex("#908caa"),

        background: hex("#191724"),
        background_panel: hex("#1f1d2e"),
        background_element: hex("#26233a"),

        border: hex("#403d52"),
        border_active: hex("#524f67"),
        border_subtle: hex("#26233a"),

        diff_added: hex("#31748f"),
        diff_removed: hex("#eb6f92"),
        diff_context: hex("#908caa"),
        diff_hunk_header: hex("#908caa"),
        diff_highlight_added: hex("#31748f"),
        diff_highlight_removed: hex("#eb6f92"),
        diff_added_bg: hex("#1a2a2e"),
        diff_removed_bg: hex("#2e1a22"),
        diff_context_bg: hex("#1f1d2e"),
        diff_line_number: hex("#26233a"),
        diff_added_line_number_bg: hex("#1a2a2e"),
        diff_removed_line_number_bg: hex("#2e1a22"),

        markdown_text: hex("#e0def4"),
        markdown_heading: hex("#c4a7e7"),
        markdown_link: hex("#ebbcba"),
        markdown_link_text: hex("#9ccfd8"),
        markdown_code: hex("#31748f"),
        markdown_block_quote: hex("#908caa"),
        markdown_emph: hex("#f6c177"),
        markdown_strong: hex("#ebbcba"),
        markdown_horizontal_rule: hex("#908caa"),
        markdown_list_item: hex("#ebbcba"),
        markdown_list_enumeration: hex("#9ccfd8"),
        markdown_image: hex("#ebbcba"),
        markdown_image_text: hex("#9ccfd8"),
        markdown_code_block: hex("#e0def4"),

        syntax_comment: hex("#908caa"),
        syntax_keyword: hex("#eb6f92"),
        syntax_function: hex("#ebbcba"),
        syntax_variable: hex("#e0def4"),
        syntax_string: hex("#f6c177"),
        syntax_number: hex("#eb6f92"),
        syntax_type: hex("#9ccfd8"),
        syntax_operator: hex("#31748f"),
        syntax_punctuation: hex("#e0def4"),

        zee_accent: hex("#9ccfd8"),
        stanley_accent: hex("#31748f"),
        johny_accent: hex("#c4a7e7"),
    }
}

pub fn rose_pine_dawn() -> Theme {
    Theme {
        id: "rosepine-light",
        name: "Rose Pine Dawn",
        is_dark: false,

        text: hex("#575279"),
        text_muted: hex("#9893a5"),

        background: hex("#faf4ed"),
        background_panel: hex("#fffaf3"),
        background_element: hex("#f2e9de"),

        border: hex("#dfdad9"),
        border_active: hex("#cecacd"),
        border_subtle: hex("#f2e9de"),

        ..rose_pine()
    }
}

// ============================================================================
// Additional Themes
// ============================================================================

pub fn vesper() -> Theme {
    let mut theme = opencode_dark();
    theme.id = "vesper";
    theme.name = "Vesper";
    theme.background = hex("#101010");
    theme.background_panel = hex("#181818");
    theme.background_element = hex("#232323");
    theme.primary = hex("#ffc799");
    theme.secondary = hex("#99ffe4");
    theme.accent = hex("#ffb0b0");
    theme
}

pub fn vercel() -> Theme {
    let mut theme = opencode_dark();
    theme.id = "vercel";
    theme.name = "Vercel";
    theme.background = hex("#000000");
    theme.background_panel = hex("#111111");
    theme.background_element = hex("#1a1a1a");
    theme.primary = hex("#ffffff");
    theme.secondary = hex("#888888");
    theme.accent = hex("#0070f3");
    theme.text = hex("#ededed");
    theme.text_muted = hex("#666666");
    theme.border = hex("#333333");
    theme
}

pub fn cobalt2() -> Theme {
    Theme {
        id: "cobalt2",
        name: "Cobalt2",
        is_dark: true,

        primary: hex("#ffc600"),
        secondary: hex("#ff9d00"),
        accent: hex("#0088ff"),

        error: hex("#ff628c"),
        warning: hex("#ff9d00"),
        success: hex("#3ad900"),
        info: hex("#0088ff"),

        text: hex("#ffffff"),
        text_muted: hex("#0d3a58"),

        background: hex("#193549"),
        background_panel: hex("#122738"),
        background_element: hex("#1f4662"),

        border: hex("#1f4662"),
        border_active: hex("#0088ff"),
        border_subtle: hex("#1f4662"),

        ..opencode_dark()
    }
}

pub fn flexoki() -> Theme {
    let mut theme = opencode_dark();
    theme.id = "flexoki";
    theme.name = "Flexoki";
    theme.background = hex("#100f0f");
    theme.background_panel = hex("#1c1b1a");
    theme.background_element = hex("#282726");
    theme.primary = hex("#ce5d97");
    theme.secondary = hex("#879a39");
    theme.accent = hex("#da702c");
    theme.text = hex("#cecdc3");
    theme.text_muted = hex("#878580");
    theme
}

pub fn kanagawa() -> Theme {
    Theme {
        id: "kanagawa",
        name: "Kanagawa",
        is_dark: true,

        primary: hex("#7e9cd8"),
        secondary: hex("#957fb8"),
        accent: hex("#ffa066"),

        error: hex("#c34043"),
        warning: hex("#dca561"),
        success: hex("#76946a"),
        info: hex("#7fb4ca"),

        text: hex("#dcd7ba"),
        text_muted: hex("#727169"),

        background: hex("#1f1f28"),
        background_panel: hex("#16161d"),
        background_element: hex("#2a2a37"),

        border: hex("#363646"),
        border_active: hex("#54546d"),
        border_subtle: hex("#2a2a37"),

        ..opencode_dark()
    }
}

pub fn everforest() -> Theme {
    Theme {
        id: "everforest",
        name: "Everforest",
        is_dark: true,

        primary: hex("#a7c080"),
        secondary: hex("#d699b6"),
        accent: hex("#e69875"),

        error: hex("#e67e80"),
        warning: hex("#dbbc7f"),
        success: hex("#a7c080"),
        info: hex("#7fbbb3"),

        text: hex("#d3c6aa"),
        text_muted: hex("#859289"),

        background: hex("#2d353b"),
        background_panel: hex("#232a2e"),
        background_element: hex("#343f44"),

        border: hex("#475258"),
        border_active: hex("#859289"),
        border_subtle: hex("#343f44"),

        ..opencode_dark()
    }
}

pub fn matrix() -> Theme {
    Theme {
        id: "matrix",
        name: "Matrix",
        is_dark: true,

        primary: hex("#00ff00"),
        secondary: hex("#008800"),
        accent: hex("#00ff00"),

        error: hex("#ff0000"),
        warning: hex("#ffff00"),
        success: hex("#00ff00"),
        info: hex("#00ffff"),

        text: hex("#00ff00"),
        text_muted: hex("#008800"),

        background: hex("#000000"),
        background_panel: hex("#001100"),
        background_element: hex("#002200"),

        border: hex("#003300"),
        border_active: hex("#00ff00"),
        border_subtle: hex("#001100"),

        ..opencode_dark()
    }
}

pub fn zenburn() -> Theme {
    Theme {
        id: "zenburn",
        name: "Zenburn",
        is_dark: true,

        primary: hex("#f0dfaf"),
        secondary: hex("#cc9393"),
        accent: hex("#7f9f7f"),

        error: hex("#cc9393"),
        warning: hex("#dfaf8f"),
        success: hex("#7f9f7f"),
        info: hex("#8cd0d3"),

        text: hex("#dcdccc"),
        text_muted: hex("#7f9f7f"),

        background: hex("#3f3f3f"),
        background_panel: hex("#2b2b2b"),
        background_element: hex("#4f4f4f"),

        border: hex("#5f5f5f"),
        border_active: hex("#7f9f7f"),
        border_subtle: hex("#4f4f4f"),

        ..opencode_dark()
    }
}
