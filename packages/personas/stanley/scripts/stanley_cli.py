#!/usr/bin/env python3
"""
Stanley CLI wrapper for JSON-based input/output.

This script provides a JSON interface for the TypeScript bridge to communicate
with the Stanley Python backend.

Usage:
    python stanley_cli.py <command> [args...]

Examples:
    python stanley_cli.py market quote AAPL
    python stanley_cli.py portfolio status
    python stanley_cli.py research analyze MSFT --filing 10-K
"""

import sys
import os

# Add the src directory to the path for development
script_dir = os.path.dirname(os.path.abspath(__file__))
src_dir = os.path.join(os.path.dirname(script_dir), "src")
if os.path.exists(src_dir):
    sys.path.insert(0, src_dir)


def main() -> None:
    """Main entry point - delegates to the Click CLI."""
    from stanley.cli import main as cli_main

    cli_main()


if __name__ == "__main__":
    main()
