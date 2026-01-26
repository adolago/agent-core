"""Tests for market data module."""

import pytest
from unittest.mock import patch, MagicMock


class TestQuotes:
    """Test quote retrieval functionality."""

    def test_get_quote_without_openbb(self):
        """Test that get_quote returns error when OpenBB is not installed."""
        from stanley.market.quotes import get_quote

        result = get_quote("AAPL")
        # Without OpenBB installed, should return an error
        assert result["ok"] is False
        assert "error" in result

    def test_get_quotes_multiple_symbols(self):
        """Test getting quotes for multiple symbols."""
        from stanley.market.quotes import get_quotes

        result = get_quotes(["AAPL", "MSFT"])
        # Without OpenBB, all quotes will fail
        assert "data" in result


class TestCharts:
    """Test chart retrieval functionality."""

    def test_get_chart_without_openbb(self):
        """Test that get_chart returns error when OpenBB is not installed."""
        from stanley.market.charts import get_chart

        result = get_chart("AAPL", period="1m", interval="1d")
        assert result["ok"] is False
        assert "error" in result

    def test_get_chart_period_mapping(self):
        """Test that period strings are correctly mapped."""
        from stanley.market.charts import PERIOD_MAP

        assert PERIOD_MAP["1d"] == 1
        assert PERIOD_MAP["1m"] == 30
        assert PERIOD_MAP["1y"] == 365
        assert PERIOD_MAP["ytd"] == "ytd"


class TestFundamentals:
    """Test fundamentals retrieval functionality."""

    def test_get_fundamentals_without_openbb(self):
        """Test that get_fundamentals returns error when OpenBB is not installed."""
        from stanley.market.fundamentals import get_fundamentals

        result = get_fundamentals("AAPL")
        assert result["ok"] is False
        assert "error" in result


class TestMarketDataClass:
    """Test the MarketData class interface."""

    def test_market_data_class_exists(self):
        """Test that MarketData class is importable."""
        from stanley.market import MarketData

        assert hasattr(MarketData, "quote")
        assert hasattr(MarketData, "quotes")
        assert hasattr(MarketData, "chart")
        assert hasattr(MarketData, "fundamentals")
