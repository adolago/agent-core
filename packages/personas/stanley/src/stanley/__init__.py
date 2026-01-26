"""
Stanley - Financial Research and Market Analysis Assistant

This package provides tools for:
- Market data retrieval (quotes, charts, fundamentals)
- Portfolio analysis (tracking, risk metrics, performance)
- SEC filings research (10-K, 10-Q, 8-K, etc.)
- Algorithmic trading backtesting via NautilusTrader
"""

__version__ = "0.1.0"
__author__ = "Agent Core Team"

from stanley.market import MarketData
from stanley.portfolio import Portfolio
from stanley.research import Research

__all__ = ["MarketData", "Portfolio", "Research", "__version__"]
