"""Tests for research module."""

import pytest
from unittest.mock import patch, MagicMock


class TestSECFilings:
    """Test SEC filings functionality."""

    def test_sec_form_types(self):
        """Test that SEC form types are defined."""
        from stanley.research.sec import SEC_FORM_TYPES

        assert "10-K" in SEC_FORM_TYPES
        assert "10-Q" in SEC_FORM_TYPES
        assert "8-K" in SEC_FORM_TYPES
        assert "13F" in SEC_FORM_TYPES

    def test_get_sec_filing_without_deps(self):
        """Test that get_sec_filing returns error without dependencies."""
        from stanley.research.sec import get_sec_filing

        result = get_sec_filing("AAPL", "10-K")
        # Without sec-edgar-downloader, should return an error
        assert result["ok"] is False
        assert "error" in result

    def test_list_sec_filings_without_openbb(self):
        """Test list_sec_filings returns error without OpenBB."""
        from stanley.research.sec import list_sec_filings

        result = list_sec_filings("AAPL", "all", 10)
        assert result["ok"] is False
        assert "error" in result


class TestAnalysis:
    """Test company analysis functionality."""

    def test_analyze_company_without_deps(self):
        """Test that analyze_company handles missing dependencies."""
        from stanley.research.analysis import analyze_company

        result = analyze_company("AAPL")
        # Should still return a result structure (may have partial data or error)
        assert "ok" in result


class TestScreener:
    """Test stock screening functionality."""

    def test_predefined_screens_exist(self):
        """Test that predefined screens are defined."""
        from stanley.research.screen import PREDEFINED_SCREENS

        assert "value" in PREDEFINED_SCREENS
        assert "growth" in PREDEFINED_SCREENS
        assert "dividend" in PREDEFINED_SCREENS
        assert "momentum" in PREDEFINED_SCREENS

    def test_parse_criteria(self):
        """Test criteria parsing."""
        from stanley.research.screen import _parse_criteria

        params = _parse_criteria("pe<15 dividend>2")
        assert "pe_ratio_lt" in params
        assert params["pe_ratio_lt"] == 15.0
        assert "dividend_yield_gt" in params
        assert params["dividend_yield_gt"] == 2.0

    def test_parse_criteria_market_cap_billions(self):
        """Test market cap parsing with B suffix."""
        from stanley.research.screen import _parse_criteria

        params = _parse_criteria("market_cap>10B")
        assert "market_cap_gt" in params
        assert params["market_cap_gt"] == 10_000_000_000

    def test_parse_criteria_market_cap_millions(self):
        """Test market cap parsing with M suffix."""
        from stanley.research.screen import _parse_criteria

        params = _parse_criteria("market_cap<500M")
        assert "market_cap_lt" in params
        assert params["market_cap_lt"] == 500_000_000

    def test_parse_criteria_market_cap_thousands(self):
        """Test market cap parsing with K suffix."""
        from stanley.research.screen import _parse_criteria

        params = _parse_criteria("market_cap>100K")
        assert "market_cap_gt" in params
        assert params["market_cap_gt"] == 100_000

    def test_screen_stocks_without_openbb(self):
        """Test that screen_stocks returns error without OpenBB."""
        from stanley.research.screen import screen_stocks

        result = screen_stocks("value")
        assert result["ok"] is False
        assert "error" in result


class TestResearchClass:
    """Test the Research class interface."""

    def test_research_class_exists(self):
        """Test that Research class is importable."""
        from stanley.research import Research

        assert hasattr(Research, "sec_filing")
        assert hasattr(Research, "list_filings")
        assert hasattr(Research, "analyze")
        assert hasattr(Research, "screen")
