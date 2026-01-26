"""
Portfolio analysis module - position tracking, risk metrics, and performance analysis.
"""

from stanley.portfolio.tracker import get_portfolio, add_position, remove_position, get_positions
from stanley.portfolio.performance import get_performance
from stanley.portfolio.risk import calculate_risk_metrics

__all__ = [
    "Portfolio",
    "get_portfolio",
    "add_position",
    "remove_position",
    "get_positions",
    "get_performance",
    "calculate_risk_metrics",
]


class Portfolio:
    """High-level interface for portfolio operations."""

    @staticmethod
    def status() -> dict:
        """Get current portfolio status."""
        return get_portfolio()

    @staticmethod
    def positions() -> dict:
        """Get all positions."""
        return get_positions()

    @staticmethod
    def performance(period: str = "ytd") -> dict:
        """Get portfolio performance metrics."""
        return get_performance(period)

    @staticmethod
    def risk(confidence: float = 0.95) -> dict:
        """Calculate risk metrics (VaR, Sharpe, Sortino)."""
        return calculate_risk_metrics(confidence)

    @staticmethod
    def add(symbol: str, shares: float, cost_basis: float) -> dict:
        """Add a position to the portfolio."""
        return add_position(symbol, shares, cost_basis)

    @staticmethod
    def remove(symbol: str) -> dict:
        """Remove a position from the portfolio."""
        return remove_position(symbol)
