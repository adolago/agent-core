"""Tests for market data module."""

import pytest
from unittest.mock import patch, MagicMock


class TestQuotes:
    """Test quote retrieval functionality."""

    def test_get_quote_returns_error_without_openbb(self):
        """Test that get_quote returns error when OpenBB is not installed."""
        with patch.dict("sys.modules", {"openbb": None}):
            # Force reimport to trigger ImportError
            import importlib
            import stanley.market.quotes as quotes_module

            # Mock the import to raise ImportError
            with patch.object(quotes_module, "get_quote") as mock_quote:
                mock_quote.return_value = {"ok": False, "error": "OpenBB not installed"}
                result = mock_quote("AAPL")
                assert result["ok"] is False
                assert "OpenBB" in result["error"]

    def test_get_quote_structure(self):
        """Test that get_quote returns expected structure."""
        from stanley.market.quotes import get_quote

        # Mock OpenBB response
        mock_result = MagicMock()
        mock_result.results = [
            MagicMock(
                last_price=150.0,
                price=150.0,
                change=2.5,
                change_percent=1.7,
                volume=50000000,
                high=152.0,
                low=148.0,
                open=149.0,
                prev_close=147.5,
                market_cap=2500000000000,
                pe=25.0,
                timestamp="2024-01-15T16:00:00",
            )
        ]

        with patch("stanley.market.quotes.obb") as mock_obb:
            mock_obb.equity.price.quote.return_value = mock_result
            result = get_quote("AAPL")

            assert result["ok"] is True
            assert "data" in result
            data = result["data"]
            assert data["symbol"] == "AAPL"
            assert data["price"] == 150.0
            assert data["change"] == 2.5

    def test_get_quotes_multiple_symbols(self):
        """Test getting quotes for multiple symbols."""
        from stanley.market.quotes import get_quotes

        with patch("stanley.market.quotes.get_quote") as mock_get_quote:
            mock_get_quote.side_effect = [
                {"ok": True, "data": {"symbol": "AAPL", "price": 150.0}},
                {"ok": True, "data": {"symbol": "MSFT", "price": 380.0}},
            ]

            result = get_quotes(["AAPL", "MSFT"])

            assert result["ok"] is True
            assert len(result["data"]["quotes"]) == 2


class TestCharts:
    """Test chart retrieval functionality."""

    def test_get_chart_structure(self):
        """Test that get_chart returns expected structure."""
        from stanley.market.charts import get_chart

        mock_result = MagicMock()
        mock_result.results = [
            MagicMock(
                date="2024-01-15",
                open=149.0,
                high=152.0,
                low=148.0,
                close=150.0,
                volume=50000000,
            )
        ]

        with patch("stanley.market.charts.obb") as mock_obb:
            mock_obb.equity.price.historical.return_value = mock_result
            result = get_chart("AAPL", period="1m", interval="1d")

            assert result["ok"] is True
            assert "data" in result
            data = result["data"]
            assert data["symbol"] == "AAPL"
            assert data["period"] == "1m"
            assert "prices" in data

    def test_get_chart_period_mapping(self):
        """Test that period strings are correctly mapped."""
        from stanley.market.charts import PERIOD_MAP

        assert PERIOD_MAP["1d"] == 1
        assert PERIOD_MAP["1m"] == 30
        assert PERIOD_MAP["1y"] == 365
        assert PERIOD_MAP["ytd"] == "ytd"


class TestFundamentals:
    """Test fundamentals retrieval functionality."""

    def test_get_fundamentals_structure(self):
        """Test that get_fundamentals returns expected structure."""
        from stanley.market.fundamentals import get_fundamentals

        mock_profile = MagicMock()
        mock_profile.results = [
            MagicMock(
                name="Apple Inc.",
                sector="Technology",
                industry="Consumer Electronics",
                market_cap=2500000000000,
                employees=150000,
                description="Apple designs, manufactures, and markets smartphones.",
            )
        ]

        with patch("stanley.market.fundamentals.obb") as mock_obb:
            mock_obb.equity.profile.return_value = mock_profile
            mock_obb.equity.fundamental.metrics.side_effect = Exception("Not available")

            result = get_fundamentals("AAPL")

            assert result["ok"] is True
            assert "data" in result
            data = result["data"]
            assert data["symbol"] == "AAPL"
            assert data["name"] == "Apple Inc."
            assert data["sector"] == "Technology"
