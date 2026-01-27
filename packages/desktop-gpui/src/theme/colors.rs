//! Color utilities for theme parsing

use gpui::Hsla;

/// Parse a hex color string to Hsla
/// Supports formats: #RGB, #RRGGBB, #RRGGBBAA
pub fn hex(color: &str) -> Hsla {
    let color = color.trim_start_matches('#');

    let (r, g, b, a) = match color.len() {
        3 => {
            // #RGB
            let r = u8::from_str_radix(&color[0..1].repeat(2), 16).unwrap_or(0);
            let g = u8::from_str_radix(&color[1..2].repeat(2), 16).unwrap_or(0);
            let b = u8::from_str_radix(&color[2..3].repeat(2), 16).unwrap_or(0);
            (r, g, b, 255u8)
        }
        6 => {
            // #RRGGBB
            let r = u8::from_str_radix(&color[0..2], 16).unwrap_or(0);
            let g = u8::from_str_radix(&color[2..4], 16).unwrap_or(0);
            let b = u8::from_str_radix(&color[4..6], 16).unwrap_or(0);
            (r, g, b, 255u8)
        }
        8 => {
            // #RRGGBBAA
            let r = u8::from_str_radix(&color[0..2], 16).unwrap_or(0);
            let g = u8::from_str_radix(&color[2..4], 16).unwrap_or(0);
            let b = u8::from_str_radix(&color[4..6], 16).unwrap_or(0);
            let a = u8::from_str_radix(&color[6..8], 16).unwrap_or(255);
            (r, g, b, a)
        }
        _ => (0, 0, 0, 255),
    };

    rgb_to_hsla(r, g, b, a)
}

/// Convert RGB to HSLA
fn rgb_to_hsla(r: u8, g: u8, b: u8, a: u8) -> Hsla {
    let r = r as f32 / 255.0;
    let g = g as f32 / 255.0;
    let b = b as f32 / 255.0;
    let a = a as f32 / 255.0;

    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;

    if max == min {
        // Achromatic
        Hsla {
            h: 0.0,
            s: 0.0,
            l,
            a,
        }
    } else {
        let d = max - min;
        let s = if l > 0.5 {
            d / (2.0 - max - min)
        } else {
            d / (max + min)
        };

        let h = if max == r {
            let h = (g - b) / d;
            if g < b { h + 6.0 } else { h }
        } else if max == g {
            (b - r) / d + 2.0
        } else {
            (r - g) / d + 4.0
        };

        Hsla {
            h: h / 6.0,
            s,
            l,
            a,
        }
    }
}

/// Create an HSLA color from components
/// h: 0-360, s: 0-100, l: 0-100, a: 0-1
pub fn hsla(h: f32, s: f32, l: f32, a: f32) -> Hsla {
    Hsla {
        h: h / 360.0,
        s: s / 100.0,
        l: l / 100.0,
        a,
    }
}

/// Lighten a color by a percentage
pub fn lighten(color: Hsla, amount: f32) -> Hsla {
    Hsla {
        l: (color.l + amount).min(1.0),
        ..color
    }
}

/// Darken a color by a percentage
pub fn darken(color: Hsla, amount: f32) -> Hsla {
    Hsla {
        l: (color.l - amount).max(0.0),
        ..color
    }
}

/// Adjust the saturation of a color
pub fn saturate(color: Hsla, amount: f32) -> Hsla {
    Hsla {
        s: (color.s + amount).clamp(0.0, 1.0),
        ..color
    }
}

/// Mix two colors
pub fn mix(a: Hsla, b: Hsla, ratio: f32) -> Hsla {
    let ratio = ratio.clamp(0.0, 1.0);
    Hsla {
        h: a.h * (1.0 - ratio) + b.h * ratio,
        s: a.s * (1.0 - ratio) + b.s * ratio,
        l: a.l * (1.0 - ratio) + b.l * ratio,
        a: a.a * (1.0 - ratio) + b.a * ratio,
    }
}

/// Set the alpha of a color
pub fn with_alpha(color: Hsla, alpha: f32) -> Hsla {
    Hsla { a: alpha, ..color }
}

/// Common color constants
pub mod constants {
    use super::hex;
    use gpui::Hsla;

    pub fn transparent() -> Hsla {
        Hsla { h: 0.0, s: 0.0, l: 0.0, a: 0.0 }
    }

    pub fn white() -> Hsla {
        hex("#ffffff")
    }

    pub fn black() -> Hsla {
        hex("#000000")
    }

    // Standard colors
    pub fn red() -> Hsla {
        hex("#ff0000")
    }

    pub fn green() -> Hsla {
        hex("#00ff00")
    }

    pub fn blue() -> Hsla {
        hex("#0000ff")
    }

    pub fn yellow() -> Hsla {
        hex("#ffff00")
    }

    pub fn cyan() -> Hsla {
        hex("#00ffff")
    }

    pub fn magenta() -> Hsla {
        hex("#ff00ff")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hex_parsing() {
        let white = hex("#ffffff");
        assert!((white.l - 1.0).abs() < 0.01);

        let black = hex("#000000");
        assert!((black.l - 0.0).abs() < 0.01);

        let red = hex("#ff0000");
        assert!((red.h - 0.0).abs() < 0.01);
        assert!((red.s - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_short_hex() {
        let white = hex("#fff");
        assert!((white.l - 1.0).abs() < 0.01);
    }
}
