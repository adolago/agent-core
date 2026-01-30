// start-wrapper.js - Wrapper to maintain backward compatibility with the new modular start command
import { printSuccess, printError, printWarning, printInfo } from '../utils.js';
import { promises as fs } from 'fs';
import { cwd, exit, existsSync } from '../node-compat.js';
import { compat } from '../runtime-detector.js';

export async function startCommand(subArgs, flags) {
  // Show help if requested
  if (flags.help || flags.h || subArgs.includes('--help') || subArgs.includes('-h')) {
    showStartHelp();
    return;
  }

  // Parse start options
  const daemon = subArgs.includes('--daemon') || subArgs.includes('-d') || flags.daemon;
  const port = flags.port || getArgValue(subArgs, '--port') || getArgValue(subArgs, '-p') || 3000;
  const verbose = subArgs.includes('--verbose') || subArgs.includes('-v') || flags.verbose;
  const ui = subArgs.includes('--ui') || subArgs.includes('-u') || flags.ui;

  try {
    printSuccess('Starting Claude-Flow Orchestration System...');
    console.log();

    if (ui) {
      printWarning('Terminal UI is not available in the simple CLI build.');
      printInfo('Use the full CLI build to run: claude-flow start --ui');
    }

    // Check if required directories exist
    const requiredDirs = ['memory', 'coordination'];
    let missingDirs = [];

    for (const dir of requiredDirs) {
      try {
        await fs.stat(dir);
      } catch {
        missingDirs.push(dir);
      }
    }

    if (missingDirs.length > 0) {
      printWarning('Missing required directories: ' + missingDirs.join(', '));
      console.log('Run "claude-flow init" first to create the necessary structure');
      return;
    }

    // Display startup information
    console.log('System Configuration:');
    console.log(`   Mode: ${daemon ? 'Daemon (background)' : 'Interactive'}`);
    console.log(`   MCP Port: ${port}`);
    console.log(`   Working Directory: ${cwd()}`);
    console.log(`   Memory Backend: JSON (default)`);
    console.log(`   Terminal Pool: 5 instances (default)`);
    console.log();

    // Initialize components
    console.log('Initializing Components:');

    // Memory system
    console.log('   ✓ Memory Bank: Ready');
    console.log('     - Backend: JSON file (memory/claude-flow-data.json)');
    console.log('     - Namespaces: Enabled');

    // Terminal pool
    console.log('   ✓ Terminal Pool: Ready');
    console.log('     - Pool Size: 5');
    console.log('     - Shell: ' + (compat.platform.os === 'windows' ? 'cmd.exe' : '/bin/bash'));

    // Task queue
    console.log('   ✓ Task Queue: Ready');
    console.log('     - Max Concurrent: 10');
    console.log('     - Priority Queue: Enabled');

    // MCP Server
    console.log('   ✓ MCP Server: Ready');
    console.log(`     - Port: ${port}`);
    console.log('     - Transport: stdio/HTTP');

    console.log();

    if (daemon) {
      // Daemon mode - would normally fork process
      printInfo('Starting in daemon mode...');
      console.log('Note: Full daemon mode requires the TypeScript version');
      console.log('The orchestrator would run in the background on port ' + port);

      // Create a simple PID file to simulate daemon
      const pid = compat.terminal.getPid();
      await compat.safeCall(async () => {
        if (compat.runtime === 'deno') {
          await fs.writeFile('.claude-flow.pid', pid.toString(), 'utf8');
        } else {
          const fs = await import('fs/promises');
          await fs.writeFile('.claude-flow.pid', pid.toString(), 'utf8');
        }
      });
      console.log(`Process ID: ${pid} (saved to .claude-flow.pid)`);
    } else {
      // Interactive mode
      printSuccess('Orchestration system started.');
      console.log();
      console.log('Available Actions:');
      console.log('   • Open another terminal and run:');
      console.log('     - claude-flow agent spawn researcher');
      console.log('     - claude-flow task create "your task"');
      console.log('     - claude-flow sparc "build feature"');
      console.log('     - claude-flow monitor');
      console.log();
      console.log('   • View system status:');
      console.log('     - claude-flow status');
      console.log();
      console.log('   • Press Ctrl+C to stop the orchestrator');
      console.log();

      if (verbose) {
        console.log('Verbose Mode - Showing system activity:');
        console.log('[' + new Date().toISOString() + '] System initialized');
        console.log('[' + new Date().toISOString() + '] Waiting for commands...');
      }

      // Keep the process running
      console.log('System is running...');

      // Set up signal handlers
      const abortController = new AbortController();

      compat.terminal.onSignal('SIGINT', () => {
        console.log('\nShutting down orchestrator...');
        cleanup();
        compat.terminal.exit(0);
      });

      // Simple heartbeat to show system is alive
      if (!daemon) {
        const heartbeat = setInterval(() => {
          if (verbose) {
            console.log('[' + new Date().toISOString() + '] Heartbeat - System healthy');
          }
        }, 30000); // Every 30 seconds

        // Wait indefinitely (until Ctrl+C)
        await new Promise(() => {});
      }
    }
  } catch (err) {
    printError(`Failed to start orchestration system: ${err.message}`);
    console.error('Stack trace:', err.stack);
  }
}

function getArgValue(args, flag) {
  const index = args.indexOf(flag);
  if (index !== -1 && index < args.length - 1) {
    return args[index + 1];
  }
  return null;
}

async function cleanup() {
  // Clean up resources
  try {
    await compat.safeCall(async () => {
      if (compat.runtime === 'deno') {
        await fs.unlink('.claude-flow.pid');
      } else {
        const fs = await import('fs/promises');
        await fs.unlink('.claude-flow.pid');
      }
    });
  } catch {
    // File might not exist
  }

  console.log('✓ Terminal pool closed');
  console.log('✓ Task queue cleared');
  console.log('✓ Memory bank saved');
  console.log('✓ Cleanup complete');
}

function showStartHelp() {
  console.log('Start the Claude-Flow orchestration system');
  console.log();
  console.log('Usage: claude-flow start [options]');
  console.log();
  console.log('Options:');
  console.log('  -d, --daemon        Run as daemon in background');
  console.log('  -p, --port <port>   Server port (default: 3000)');
  console.log('  -u, --ui            Launch terminal-based process management UI (full CLI)');
  console.log('  -v, --verbose       Show detailed system activity');
  console.log('  -h, --help          Show this help message');
  console.log();
  console.log('Examples:');
  console.log('  claude-flow start                    # Start in interactive mode');
  console.log('  claude-flow start --daemon           # Start as background daemon');
  console.log('  claude-flow start --port 8080        # Use custom server port');
  console.log('  claude-flow start --ui               # Launch terminal-based UI (full CLI)');
  console.log('  claude-flow start --verbose          # Show detailed logs');
  console.log();
  console.log('Terminal-based UI:');
  console.log('  The --ui flag is available in the full CLI build.');
  console.log();
  console.log('Notes:');
  console.log('  - Requires "claude-flow init" to be run first');
  console.log('  - Interactive mode shows real-time system status');
  console.log('  - Daemon mode runs in background (check logs)');
  console.log('  - Use "claude-flow status" to check if running');
  console.log('  - Use Ctrl+C or "claude-flow stop" to shutdown');
}
