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

    def test_get_sec_filing_invalid_type(self):
        """Test that invalid form type returns error."""
        from stanley.research.sec import get_sec_filing

        result = get_sec_filing("AAPL", "INVALID")
        assert result["ok"] is False
        assert "Invalid form type" in result["error"]

    def test_list_sec_filings_structure(self):
        """Test list_sec_filings returns expected structure."""
        from stanley.research.sec import list_sec_filings

        mock_result = MagicMock()
        mock_result.results = [
            MagicMock(type="10-K", date="2024-01-15", url="https://example.com/filing"),
            MagicMock(type="10-Q", date="2024-03-15", url="https://example.com/filing2"),
        ]

        with patch("stanley.research.sec.obb") as mock_obb:
            mock_obb.equity.fundamental.filings.return_value = mock_result

            result = list_sec_filings("AAPL", "all", 10)

            assert result["ok"] is True
            assert result["data"]["ticker"] == "AAPL"
            assert len(result["data"]["filings"]) == 2


class TestAnalysis:
    """Test company analysis functionality."""

    def test_analyze_company_structure(self):
        """Test that analyze_company returns expected structure."""
        from stanley.research.analysis import analyze_company

        mock_fundamentals = {
            "ok": True,
            "data": {
                "name": "Apple Inc.",
                "sector": "Technology",
                "industry": "Consumer Electronics",
                "market_cap": 2500000000000,
                "pe_ratio": 25.0,
            },
        }

        mock_filings = {
            "ok": True,
            "data": {
                "filings": [
                    {"type": "10-K", "date": "2024-01-15"},
                ]
            },
        }

        with patch("stanley.research.analysis.get_fundamentals") as mock_fund:
            with patch("stanley.research.analysis.list_sec_filings") as mock_sec:
                mock_fund.return_value = mock_fundamentals
                mock_sec.return_value = mock_filings

                result = analyze_company("AAPL")

                assert result["ok"] is True
                assert result["data"]["ticker"] == "AAPL"
                assert "company_overview" in result["data"]
                assert "financial_highlights" in result["data"]


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

    def test_parse_criteria_market_cap(self):
        """Test market cap parsing with suffixes."""
        from stanley.research.screen import _parse_criteria

        params = _parse_criteria("market_cap>10B")
        assert "market_cap_gt" in params
        assert params["market_cap_gt"] == 10_000_000_000

        params = _parse_criteria("market_cap<500M")
        assert "market_cap_lt" in params
        assert params["market_cap_lt"] == 500_000_000
