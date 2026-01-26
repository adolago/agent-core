"""Tests for portfolio module."""

import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
import tempfile


class TestPortfolioTracker:
    """Test portfolio tracking functionality."""

    def test_load_empty_portfolio(self):
        """Test loading a non-existent portfolio returns empty structure."""
        from stanley.portfolio.tracker import _load_portfolio

        with patch("stanley.portfolio.tracker._get_portfolio_path") as mock_path:
            mock_path.return_value = Path("/nonexistent/path/portfolio.json")
            portfolio = _load_portfolio()

            assert portfolio["positions"] == []
            assert portfolio["cash"] == 0.0

    def test_save_and_load_portfolio(self):
        """Test saving and loading a portfolio."""
        from stanley.portfolio.tracker import _save_portfolio, _load_portfolio

        with tempfile.TemporaryDirectory() as tmpdir:
            portfolio_path = Path(tmpdir) / "portfolio.json"

            with patch("stanley.portfolio.tracker._get_portfolio_path") as mock_path:
                mock_path.return_value = portfolio_path

                test_portfolio = {
                    "positions": [{"symbol": "AAPL", "shares": 10, "cost_basis": 150.0}],
                    "cash": 5000.0,
                }
                _save_portfolio(test_portfolio)

                loaded = _load_portfolio()
                assert loaded["positions"] == test_portfolio["positions"]
                assert loaded["cash"] == test_portfolio["cash"]
                assert "updated_at" in loaded

    def test_add_position_new(self):
        """Test adding a new position."""
        from stanley.portfolio.tracker import add_position

        with tempfile.TemporaryDirectory() as tmpdir:
            portfolio_path = Path(tmpdir) / "portfolio.json"

            with patch("stanley.portfolio.tracker._get_portfolio_path") as mock_path:
                mock_path.return_value = portfolio_path

                result = add_position("AAPL", 10, 150.0)

                assert result["ok"] is True
                assert result["data"]["action"] == "added"
                assert result["data"]["position"]["symbol"] == "AAPL"
                assert result["data"]["position"]["shares"] == 10
                assert result["data"]["position"]["cost_basis"] == 150.0

    def test_add_position_existing_averages_cost(self):
        """Test that adding to existing position averages cost basis."""
        from stanley.portfolio.tracker import add_position, _save_portfolio

        with tempfile.TemporaryDirectory() as tmpdir:
            portfolio_path = Path(tmpdir) / "portfolio.json"

            with patch("stanley.portfolio.tracker._get_portfolio_path") as mock_path:
                mock_path.return_value = portfolio_path

                # Initial position: 10 shares @ $100
                _save_portfolio(
                    {
                        "positions": [{"symbol": "AAPL", "shares": 10, "cost_basis": 100.0}],
                        "cash": 0,
                    }
                )

                # Add 10 more shares @ $150
                result = add_position("AAPL", 10, 150.0)

                assert result["ok"] is True
                assert result["data"]["action"] == "updated"
                # Average: (10*100 + 10*150) / 20 = 125
                assert result["data"]["position"]["shares"] == 20
                assert result["data"]["position"]["cost_basis"] == 125.0

    def test_remove_position(self):
        """Test removing a position."""
        from stanley.portfolio.tracker import remove_position, _save_portfolio

        with tempfile.TemporaryDirectory() as tmpdir:
            portfolio_path = Path(tmpdir) / "portfolio.json"

            with patch("stanley.portfolio.tracker._get_portfolio_path") as mock_path:
                mock_path.return_value = portfolio_path

                _save_portfolio(
                    {
                        "positions": [
                            {"symbol": "AAPL", "shares": 10, "cost_basis": 100.0},
                            {"symbol": "MSFT", "shares": 5, "cost_basis": 350.0},
                        ],
                        "cash": 0,
                    }
                )

                result = remove_position("AAPL")

                assert result["ok"] is True
                assert result["data"]["removed"]["symbol"] == "AAPL"

    def test_remove_nonexistent_position(self):
        """Test removing a position that doesn't exist."""
        from stanley.portfolio.tracker import remove_position

        with tempfile.TemporaryDirectory() as tmpdir:
            portfolio_path = Path(tmpdir) / "portfolio.json"

            with patch("stanley.portfolio.tracker._get_portfolio_path") as mock_path:
                mock_path.return_value = portfolio_path

                result = remove_position("FAKE")

                assert result["ok"] is False
                assert "not found" in result["error"]


class TestPortfolioPerformance:
    """Test portfolio performance calculations."""

    def test_performance_empty_portfolio(self):
        """Test performance calculation with empty portfolio."""
        from stanley.portfolio.performance import get_performance

        with patch("stanley.portfolio.tracker.get_portfolio") as mock_portfolio:
            mock_portfolio.return_value = {"ok": True, "data": {"positions": []}}

            result = get_performance("ytd")

            assert result["ok"] is False
            assert "No positions" in result["error"]


class TestPortfolioRisk:
    """Test portfolio risk calculations."""

    def test_risk_empty_portfolio(self):
        """Test risk calculation with empty portfolio."""
        from stanley.portfolio.risk import calculate_risk_metrics

        with patch("stanley.portfolio.tracker.get_portfolio") as mock_portfolio:
            mock_portfolio.return_value = {"ok": True, "data": {"positions": []}}

            result = calculate_risk_metrics(0.95)

            assert result["ok"] is False
            assert "No positions" in result["error"]


class TestPortfolioClass:
    """Test the Portfolio class interface."""

    def test_portfolio_class_exists(self):
        """Test that Portfolio class is importable."""
        from stanley.portfolio import Portfolio

        assert hasattr(Portfolio, "status")
        assert hasattr(Portfolio, "positions")
        assert hasattr(Portfolio, "performance")
        assert hasattr(Portfolio, "risk")
        assert hasattr(Portfolio, "add")
        assert hasattr(Portfolio, "remove")
