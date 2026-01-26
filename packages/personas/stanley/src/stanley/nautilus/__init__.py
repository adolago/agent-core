"""
NautilusTrader integration for backtesting and paper trading.
"""

from stanley.nautilus.backtest import run_backtest, list_strategies
from stanley.nautilus.paper_trade import start_paper_trading, stop_paper_trading, get_paper_status

__all__ = [
    "Nautilus",
    "run_backtest",
    "list_strategies",
    "start_paper_trading",
    "stop_paper_trading",
    "get_paper_status",
]


class Nautilus:
    """High-level interface for NautilusTrader operations."""

    @staticmethod
    def backtest(strategy: str, symbols: list[str], start_date: str, end_date: str | None = None) -> dict:
        """Run a backtest."""
        return run_backtest(strategy, symbols, start_date, end_date)

    @staticmethod
    def strategies() -> dict:
        """List available strategies."""
        return list_strategies()

    @staticmethod
    def paper_trade(strategy: str, symbols: list[str], capital: float = 100000) -> dict:
        """Start paper trading."""
        return start_paper_trading(strategy, symbols, capital)

    @staticmethod
    def stop_paper() -> dict:
        """Stop paper trading."""
        return stop_paper_trading()

    @staticmethod
    def paper_status() -> dict:
        """Get paper trading status."""
        return get_paper_status()
