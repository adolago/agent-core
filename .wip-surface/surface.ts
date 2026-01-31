/**
 * Surface Bootstrap
 *
 * Initializes the surface router and registers default surfaces.
 * Called by daemon on startup to enable multi-surface support.
 */

import { getSurfaceRouter, SurfaceRouter } from '../../../../src/surface/router.js';
import { createCLISurface } from '../../../../src/surface/cli.js';
import { createMessagingSurface } from '../../../../src/surface/messaging.js';
import {
  createWhatsAppHandler,
  createTelegramHandler,
} from '../../../../src/surface/platforms/index.js';
import type { Surface } from '../../../../src/surface/surface.js';
import { Log } from '../util/log';
import { getConfig } from '../config/config';

const log = Log.create({ service: 'surface-bootstrap' });

// Track initialized state
let initialized = false;
let router: SurfaceRouter | null = null;

// =============================================================================
// Configuration Types
// =============================================================================

type SurfaceBootstrapConfig = {
  /** Enable CLI surface (default: true) */
  enableCLI?: boolean;
  /** Enable WhatsApp surface (default: false) */
  enableWhatsApp?: boolean;
  /** Enable Telegram surface (default: false) */
  enableTelegram?: boolean;
  /** WhatsApp configuration */
  whatsapp?: {
    sessionName: string;
    allowedNumbers?: string[];
    allowedGroups?: string[];
    requireMention?: boolean;
  };
  /** Telegram configuration */
  telegram?: {
    botToken: string;
    allowedUsers?: number[];
    allowedGroups?: number[];
    requireMention?: boolean;
  };
  /** Enable analytics collection */
  enableAnalytics?: boolean;
  /** Enable hot-reload of surface configs */
  enableHotReload?: boolean;
};

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize surface layer and register configured surfaces.
 */
export async function initSurfaces(): Promise<void> {
  if (initialized) {
    log.debug('Surfaces already initialized');
    return;
  }

  log.info('Initializing surface layer');

  // Load configuration
  const config = await loadSurfaceConfig();

  // Create router with configuration
  router = getSurfaceRouter({
    enableAnalytics: config.enableAnalytics ?? true,
    enableHotReload: config.enableHotReload ?? false,
  });

  // Register CLI surface (always enabled in daemon mode)
  if (config.enableCLI !== false) {
    await registerCLISurface();
  }

  // Register WhatsApp surface if configured
  if (config.enableWhatsApp && config.whatsapp) {
    await registerWhatsAppSurface(config.whatsapp);
  }

  // Register Telegram surface if configured
  if (config.enableTelegram && config.telegram) {
    await registerTelegramSurface(config.telegram);
  }

  // Initialize router (connects all surfaces)
  await router.init();

  initialized = true;
  log.info('Surface layer initialized', {
    surfaces: router.getAllSurfaces().map((s) => s.id),
  });
}

/**
 * Shutdown surface layer and disconnect all surfaces.
 */
export async function shutdownSurfaces(): Promise<void> {
  if (!initialized || !router) {
    return;
  }

  log.info('Shutting down surface layer');

  await router.shutdown();
  router = null;
  initialized = false;

  log.info('Surface layer shutdown complete');
}

/**
 * Get the initialized surface router.
 */
export function getRouter(): SurfaceRouter | null {
  return router;
}

// =============================================================================
// Surface Registration
// =============================================================================

async function registerCLISurface(): Promise<void> {
  if (!router) return;

  log.info('Registering CLI surface');

  const cliSurface = createCLISurface({
    interactive: true,
    streaming: true,
  });

  await router.registerSurface(cliSurface);
}

async function registerWhatsAppSurface(config: NonNullable<SurfaceBootstrapConfig['whatsapp']>): Promise<void> {
  if (!router) return;

  log.info('Registering WhatsApp surface');

  try {
    const handler = createWhatsAppHandler({
      sessionName: config.sessionName,
      allowedNumbers: config.allowedNumbers,
      allowedGroups: config.allowedGroups,
      requireMention: config.requireMention ?? true,
    });

    const surface = createMessagingSurface(handler, {
      allowGroups: true,
      groups: {
        requireMention: config.requireMention ?? true,
      },
    });

    await router.registerSurface(surface);
    log.info('WhatsApp surface registered');
  } catch (error) {
    log.error('Failed to register WhatsApp surface', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - other surfaces can still work
  }
}

async function registerTelegramSurface(config: NonNullable<SurfaceBootstrapConfig['telegram']>): Promise<void> {
  if (!router) return;

  log.info('Registering Telegram surface');

  try {
    const handler = createTelegramHandler({
      botToken: config.botToken,
      allowedUsers: config.allowedUsers,
      allowedGroups: config.allowedGroups,
      requireMention: config.requireMention ?? true,
    });

    const surface = createMessagingSurface(handler, {
      allowGroups: true,
      groups: {
        requireMention: config.requireMention ?? true,
      },
    });

    await router.registerSurface(surface);
    log.info('Telegram surface registered');
  } catch (error) {
    log.error('Failed to register Telegram surface', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - other surfaces can still work
  }
}

// =============================================================================
// Configuration Loading
// =============================================================================

async function loadSurfaceConfig(): Promise<SurfaceBootstrapConfig> {
  try {
    const config = await getConfig();

    // Extract surface configuration from agent-core config
    const surfaceConfig: SurfaceBootstrapConfig = {
      enableCLI: config.experimental?.surfaces?.cli?.enabled ?? true,
      enableWhatsApp: config.experimental?.surfaces?.whatsapp?.enabled ?? false,
      enableTelegram: config.experimental?.surfaces?.telegram?.enabled ?? false,
      whatsapp: config.experimental?.surfaces?.whatsapp,
      telegram: config.experimental?.surfaces?.telegram,
      enableAnalytics: config.experimental?.surfaces?.analytics?.enabled ?? true,
      enableHotReload: config.experimental?.surfaces?.hotReload?.enabled ?? false,
    };

    return surfaceConfig;
  } catch (error) {
    log.debug('Could not load surface config, using defaults', {
      error: error instanceof Error ? error.message : String(error),
    });

    // Return defaults
    return {
      enableCLI: true,
      enableWhatsApp: false,
      enableTelegram: false,
      enableAnalytics: true,
      enableHotReload: false,
    };
  }
}

// =============================================================================
// Dynamic Surface Management
// =============================================================================

/**
 * Register an additional surface at runtime.
 */
export async function registerSurface(surface: Surface): Promise<void> {
  if (!router) {
    throw new Error('Surface router not initialized');
  }

  await router.registerSurface(surface);
}

/**
 * Unregister a surface at runtime.
 */
export async function unregisterSurface(surfaceId: string): Promise<void> {
  if (!router) {
    throw new Error('Surface router not initialized');
  }

  await router.unregisterSurface(surfaceId);
}

/**
 * Get analytics for all surfaces or a specific surface.
 */
export function getSurfaceAnalytics(surfaceId?: string) {
  if (!router) {
    return [];
  }

  return router.getAnalytics(surfaceId);
}

/**
 * Get current session statistics.
 */
export function getSurfaceSessionStats() {
  if (!router) {
    return {
      totalSessions: 0,
      totalMessages: 0,
      activeSurfaces: 0,
    };
  }

  return router.getSessionStats();
}
