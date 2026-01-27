//! View modules for Agent Core Desktop

pub mod chat;
pub mod sessions;
pub mod settings;

// Trading views (conditional)
#[cfg(feature = "trading")]
pub mod trading;
