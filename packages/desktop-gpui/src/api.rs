//! HTTP client for Agent Core daemon API
//!
//! Provides async methods for interacting with the daemon running on :3210.

pub mod client;
pub mod types;

pub use client::*;

use gpui::*;
use std::sync::Arc;
use tokio::runtime::Runtime;

/// Global API client state with Tokio runtime for HTTP operations
pub struct ApiState {
    pub client: AgentCoreClient,
    pub connected: bool,
    /// Tokio runtime handle for HTTP operations
    pub runtime: Arc<Runtime>,
}

impl ApiState {
    fn new() -> Self {
        // Create a dedicated Tokio runtime for HTTP operations
        let runtime = Runtime::new().expect("Failed to create Tokio runtime");

        // Create the reqwest client within the Tokio runtime context
        let client = runtime.block_on(async {
            AgentCoreClient::new("http://127.0.0.1:3210")
        });

        Self {
            client,
            connected: false,
            runtime: Arc::new(runtime),
        }
    }
}

impl Global for ApiState {}

/// Initialize the API client
pub fn init(cx: &mut App) {
    cx.set_global(ApiState::new());
    tracing::debug!("API client initialized with Tokio runtime");
}

/// Get the API client
pub fn client(cx: &App) -> &AgentCoreClient {
    &cx.global::<ApiState>().client
}
