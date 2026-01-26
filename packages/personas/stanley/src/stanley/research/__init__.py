"""
Research module - SEC filings, analysis, and stock screening.
"""

from stanley.research.sec import get_sec_filing, list_sec_filings
from stanley.research.analysis import analyze_company
from stanley.research.screen import screen_stocks

__all__ = [
    "Research",
    "get_sec_filing",
    "list_sec_filings",
    "analyze_company",
    "screen_stocks",
]


class Research:
    """High-level interface for research operations."""

    @staticmethod
    def sec_filing(ticker: str, form_type: str = "10-K", year: int | None = None) -> dict:
        """Get SEC filing for a company."""
        return get_sec_filing(ticker, form_type, year)

    @staticmethod
    def list_filings(ticker: str, form_type: str = "all", limit: int = 10) -> dict:
        """List available SEC filings."""
        return list_sec_filings(ticker, form_type, limit)

    @staticmethod
    def analyze(ticker: str, filing_type: str = "10-K") -> dict:
        """Analyze a company using SEC filings."""
        return analyze_company(ticker, filing_type)

    @staticmethod
    def screen(criteria: str) -> dict:
        """Screen stocks based on criteria."""
        return screen_stocks(criteria)
