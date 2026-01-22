/**
 * SQLite Wrapper with Windows Fallback Support
 * Provides graceful fallback when better-sqlite3 fails to load
 * Includes auto-rebuild for NODE_MODULE_VERSION mismatches
 */

import { createRequire } from 'module';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let Database = null;
let sqliteAvailable = false;
let loadError = null;
let rebuildAttempted = false;

/**
 * Attempt to rebuild better-sqlite3 for the current Node.js version
 */
function tryRebuildBetterSqlite3() {
  if (rebuildAttempted) return false;
  rebuildAttempted = true;

  try {
    // Find the better-sqlite3 module path
    const require = createRequire(import.meta.url);
    const betterSqlite3Path = path.dirname(require.resolve('better-sqlite3/package.json'));

    console.warn(`\n🔧 Attempting to rebuild better-sqlite3 for Node.js ${process.version}...`);

    // Run npm rebuild in the better-sqlite3 directory
    execSync('npm rebuild', {
      cwd: betterSqlite3Path,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000 // 2 minute timeout
    });

    console.warn(`✅ Rebuild successful! Retrying SQLite load...\n`);
    return true;
  } catch (err) {
    console.warn(`⚠️  Auto-rebuild failed: ${err.message}`);
    console.warn(`   You may need build tools installed (python, make, g++)\n`);
    return false;
  }
}

/**
 * Try to load better-sqlite3 with comprehensive error handling
 */
async function tryLoadSQLite() {
  try {
    // Try CommonJS require first (more reliable in Node.js)
    const require = createRequire(import.meta.url);
    Database = require('better-sqlite3');
    sqliteAvailable = true;
    return true;
  } catch (requireErr) {
    // Fallback to ES module import
    try {
      const module = await import('better-sqlite3');
      Database = module.default;
      sqliteAvailable = true;
      return true;
    } catch (importErr) {
      loadError = importErr;

      // Check for NODE_MODULE_VERSION mismatch (different Node.js ABI)
      const isVersionMismatch =
        requireErr.message?.includes('NODE_MODULE_VERSION') ||
        importErr.message?.includes('NODE_MODULE_VERSION') ||
        requireErr.message?.includes('was compiled against a different Node.js version') ||
        importErr.message?.includes('was compiled against a different Node.js version');

      if (isVersionMismatch) {
        // Try auto-rebuild first
        if (!rebuildAttempted && tryRebuildBetterSqlite3()) {
          // Rebuild succeeded, try loading again
          try {
            const require = createRequire(import.meta.url);
            // Clear the require cache to pick up rebuilt module
            const modulePath = require.resolve('better-sqlite3');
            delete require.cache[modulePath];
            Database = require('better-sqlite3');
            sqliteAvailable = true;
            loadError = null;
            return true;
          } catch (retryErr) {
            // Rebuild succeeded but load still failed
            loadError = retryErr;
          }
        }

        // Extract version info for helpful message
        const errorMsg = requireErr.message || importErr.message || '';
        const compiledMatch = errorMsg.match(/NODE_MODULE_VERSION (\d+)/);
        const requiredMatch = errorMsg.match(/requires\s+NODE_MODULE_VERSION (\d+)/);

        const nodeVersionMap = {
          '108': '18.x', '115': '20.x', '120': '21.x', '127': '22.x', '131': '23.x'
        };

        let versionInfo = '';
        if (compiledMatch && requiredMatch) {
          const compiled = nodeVersionMap[compiledMatch[1]] || `ABI ${compiledMatch[1]}`;
          const required = nodeVersionMap[requiredMatch[1]] || `ABI ${requiredMatch[1]}`;
          versionInfo = `\n║  Module compiled for Node.js ${compiled}, running Node.js ${required}`.padEnd(79) + '║';
        }

        console.warn(`
╔══════════════════════════════════════════════════════════════════════════════╗
║              Native Module Version Mismatch (NODE_MODULE_VERSION)            ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  The better-sqlite3 module was compiled for a different Node.js version.    ║${versionInfo}
║                                                                              ║
║  Auto-rebuild was attempted but SQLite is still unavailable.                 ║
║  Claude Flow will continue with JSON fallback storage (still works fine).   ║
║                                                                              ║
║  To manually fix this and use SQLite:                                        ║
║                                                                              ║
║  Option 1 - Global install (recommended):                                    ║
║  > npm install -g claude-flow@alpha                                          ║
║                                                                              ║
║  Option 2 - Clear npx cache:                                                 ║
║  > rm -rf ~/.npm/_npx/ && npx claude-flow@alpha ...                          ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);
        return false;
      }

      // Check for other Windows/installation errors
      if (requireErr.message?.includes('Could not locate the bindings file') ||
          requireErr.message?.includes('The specified module could not be found') ||
          requireErr.code === 'MODULE_NOT_FOUND') {

        console.warn(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                     SQLite Native Module Installation Issue                   ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║  The native SQLite module failed to load. This is common on Windows when    ║
║  using 'npx' or when node-gyp build tools are not available.                ║
║                                                                              ║
║  Claude Flow will continue with JSON fallback storage (still works fine).   ║
║                                                                              ║
║  To enable SQLite storage:                                                   ║
║                                                                              ║
║  Option 1 - Install Build Tools (Windows):                                   ║
║  > npm install --global windows-build-tools                                  ║
║  > npm install claude-flow@alpha                                             ║
║                                                                              ║
║  Option 2 - Use WSL (Windows Subsystem for Linux):                           ║
║  Install WSL and run Claude Flow inside a Linux environment                  ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);
      }
      
      return false;
    }
  }
}

/**
 * Check if SQLite is available
 */
export async function isSQLiteAvailable() {
  if (sqliteAvailable !== null) {
    return sqliteAvailable;
  }
  
  await tryLoadSQLite();
  return sqliteAvailable;
}

/**
 * Get SQLite Database constructor or null
 */
export async function getSQLiteDatabase() {
  if (!sqliteAvailable && loadError === null) {
    await tryLoadSQLite();
  }
  
  return Database;
}

/**
 * Get the load error if any
 */
export function getLoadError() {
  return loadError;
}

/**
 * Create a SQLite database instance with fallback
 */
export async function createDatabase(dbPath) {
  const DB = await getSQLiteDatabase();

  if (!DB) {
    throw new Error('SQLite is not available. Use fallback storage instead.');
  }

  try {
    return new DB(dbPath);
  } catch (err) {
    // Check for NODE_MODULE_VERSION mismatch at instantiation time
    const isVersionMismatch =
      err.message?.includes('NODE_MODULE_VERSION') ||
      err.message?.includes('was compiled against a different Node.js version') ||
      err.code === 'ERR_DLOPEN_FAILED';

    if (isVersionMismatch && !rebuildAttempted) {
      // Try auto-rebuild
      if (tryRebuildBetterSqlite3()) {
        // Rebuild succeeded, try again
        try {
          const require = createRequire(import.meta.url);
          // Clear require cache
          const modulePath = require.resolve('better-sqlite3');
          delete require.cache[modulePath];
          // Also clear any cached .node files
          Object.keys(require.cache).forEach(key => {
            if (key.includes('better_sqlite3.node') || key.includes('better-sqlite3')) {
              delete require.cache[key];
            }
          });
          // Re-require and instantiate
          const NewDB = require('better-sqlite3');
          Database = NewDB;
          return new NewDB(dbPath);
        } catch (retryErr) {
          // Rebuild didn't help
          throw err;
        }
      }
    }

    // Additional Windows-specific error handling
    if (err.message?.includes('EPERM') || err.message?.includes('access denied')) {
      throw new Error(`Cannot create database at ${dbPath}. Permission denied. Try using a different directory or running with administrator privileges.`);
    }
    throw err;
  }
}

/**
 * Check if running on Windows
 */
export function isWindows() {
  return process.platform === 'win32';
}

/**
 * Get platform-specific storage recommendations
 */
export function getStorageRecommendations() {
  if (isWindows()) {
    return {
      recommended: 'in-memory',
      reason: 'Windows native module compatibility',
      alternatives: [
        'Install Windows build tools for SQLite support',
        'Use WSL (Windows Subsystem for Linux)',
        'Use Docker container with Linux'
      ]
    };
  }
  
  return {
    recommended: 'sqlite',
    reason: 'Best performance and persistence',
    alternatives: ['in-memory for testing']
  };
}

// Pre-load SQLite on module import
tryLoadSQLite().catch(() => {
  // Silently handle initial load failure
});

export default {
  isSQLiteAvailable,
  getSQLiteDatabase,
  getLoadError,
  createDatabase,
  isWindows,
  getStorageRecommendations
};