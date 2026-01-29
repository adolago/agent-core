//! Agent Core Desktop - Unified GPUI Desktop Application
//!
//! This application provides a native desktop interface for Agent Core,
//! featuring the Personas triad (Zee, Stanley, Johny) and full agent capabilities.

mod api;
mod app;
mod components;
mod dialogs;
mod events;
mod i18n;
mod keyboard;
mod state;
mod theme;
mod update;
mod views;

use anyhow::Result;
use gpui::prelude::*;
use gpui::*;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

fn main() -> Result<()> {
    // Initialize logging
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting Agent Core Desktop");

    // Initialize GPUI application
    Application::new().run(|cx: &mut App| {
        // Initialize i18n before views
        i18n::init(cx);

        // Initialize state management
        state::init(cx);

        // Initialize theme system (also sets global Theme)
        theme::init(cx);

        // Register keyboard bindings
        keyboard::init(cx);

        // Initialize API client
        api::init(cx);

        // Start real-time event subscription
        events::start_event_loop(cx);

        // Open the main window
        cx.open_window(
            WindowOptions {
                titlebar: Some(TitlebarOptions {
                    title: Some("Agent Core".into()),
                    appears_transparent: true,
                    ..Default::default()
                }),
                window_bounds: Some(WindowBounds::Windowed(Bounds {
                    origin: point(px(100.0), px(100.0)),
                    size: size(px(1200.0), px(800.0)),
                })),
                ..Default::default()
            },
            |_window, cx| cx.new(|cx| app::AppRoot::new(cx)),
        )
        .unwrap();

        tracing::info!("Agent Core Desktop window opened");
    });

    Ok(())
}
