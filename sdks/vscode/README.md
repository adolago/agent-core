# VS Code Extension

A Visual Studio Code extension that integrates the CLI directly into your development workflow.

## Prerequisites

This extension requires the CLI to be installed and available on your PATH.

## Features

- **Quick Launch**: Use `Cmd+Esc` or `Ctrl+Esc` to open the CLI in a split terminal view, or focus an existing terminal session if one is already running.
- **New Session**: Use `Cmd+Shift+Esc` or `Ctrl+Shift+Esc` to start a new CLI terminal session, even if one is already open. You can also click the command button in the UI.
- **Context Awareness**: Automatically share your current selection or tab with the CLI.
- **File Reference Shortcuts**: Use `Cmd+Option+K` or `Alt+Ctrl+K` to insert file references. For example, `@File#L37-42`.

## Development

1. `code sdks/vscode` - Open the `sdks/vscode` directory in VS Code. **Do not open from repo root.**
2. `bun install` - Run inside the `sdks/vscode` directory.
3. Press `F5` to start debugging - This launches a new VS Code window with the extension loaded.

#### Making Changes

`tsc` and `esbuild` watchers run automatically during debugging (visible in the Terminal tab). Changes to the extension are automatically rebuilt in the background.

To test your changes:

1. In the debug VS Code window, press `Cmd+Shift+P`
2. Search for `Developer: Reload Window`
3. Reload to see your changes without restarting the debug session
