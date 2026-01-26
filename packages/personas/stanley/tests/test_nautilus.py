"""Tests for nautilus module."""

import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
import tempfile


class TestBacktest:
    """Test backtesting functionality."""

    def test_list_strategies(self):
        """Test that strategies are listed."""
        from stanley.nautilus.backtest import list_strategies

        result = list_strategies()

        assert result["ok"] is True
        assert "strategies" in result["data"]
        assert len(result["data"]["strategies"]) > 0

        # Check for known strategies
        strategy_ids = [s["id"] for s in result["data"]["strategies"]]
        assert "momentum" in strategy_ids
        assert "sma_crossover" in strategy_ids
        assert "buy_and_hold" in strategy_ids

    def test_builtin_strategies_structure(self):
        """Test that builtin strategies have required fields."""
        from stanley.nautilus.backtest import BUILTIN_STRATEGIES

        for strategy_id, strategy in BUILTIN_STRATEGIES.items():
            assert "name" in strategy
            assert "description" in strategy
            assert "parameters" in strategy

    def test_run_backtest_unknown_strategy(self):
        """Test that unknown strategy returns error."""
        from stanley.nautilus.backtest import run_backtest

        result = run_backtest("unknown_strategy", ["AAPL"], "2024-01-01")

        assert result["ok"] is False
        assert "Unknown strategy" in result["error"]

    def test_run_simple_backtest(self):
        """Test simple backtest execution."""
        from stanley.nautilus.backtest import _run_simple_backtest

        mock_chart = {
            "ok": True,
            "data": {
                "prices": [
                    {"close": 100.0} for _ in range(100)
                ]
            }
        }

        # Simulate price changes for more realistic test
        for i, price in enumerate(mock_chart["data"]["prices"]):
            price["close"] = 100.0 + (i * 0.5)  # Slight upward trend

        with patch("stanley.nautilus.backtest.get_chart") as mock_get_chart:
            mock_get_chart.return_value = mock_chart

            result = _run_simple_backtest(
                "buy_and_hold",
                ["AAPL"],
                "2024-01-01",
                None
            )

            assert result["ok"] is True
            assert "total_return_percent" in result["data"]
            assert "sharpe_ratio" in result["data"]

    def test_sma_calculation(self):
        """Test SMA calculation helper."""
        from stanley.nautilus.backtest import _sma
        import numpy as np

        data = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0])
        sma = _sma(data, 3)

        # SMA should be 0 for first 3 elements (lookback period)
        assert sma[0] == 0
        assert sma[1] == 0
        assert sma[2] == 0
        # SMA at index 3 should be mean of [1, 2, 3]
        assert sma[3] == pytest.approx(2.0, abs=0.1)

    def test_rsi_calculation(self):
        """Test RSI calculation helper."""
        from stanley.nautilus.backtest import _rsi
        import numpy as np

        # Create price data with clear trend
        data = np.array([100.0 + i for i in range(50)])  # Upward trend
        rsi = _rsi(data, 14)

        # RSI should be high (>50) for upward trend after warmup period
        assert rsi[-1] > 50


class TestPaperTrading:
    """Test paper trading functionality."""

    def test_start_paper_trading(self):
        """Test starting paper trading."""
        from stanley.nautilus.paper_trade import start_paper_trading

        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "paper_trading.json"

            with patch("stanley.nautilus.paper_trade._get_paper_state_path") as mock_path:
                mock_path.return_value = state_path

                result = start_paper_trading("momentum", ["AAPL"], 100000)

                assert result["ok"] is True
                assert "Paper trading started" in result["data"]["message"]
                assert result["data"]["capital"] == 100000

    def test_start_paper_trading_unknown_strategy(self):
        """Test starting paper trading with unknown strategy."""
        from stanley.nautilus.paper_trade import start_paper_trading

        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "paper_trading.json"

            with patch("stanley.nautilus.paper_trade._get_paper_state_path") as mock_path:
                mock_path.return_value = state_path

                result = start_paper_trading("unknown", ["AAPL"], 100000)

                assert result["ok"] is False
                assert "Unknown strategy" in result["error"]

    def test_stop_paper_trading_no_session(self):
        """Test stopping paper trading when no session active."""
        from stanley.nautilus.paper_trade import stop_paper_trading

        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "paper_trading.json"

            with patch("stanley.nautilus.paper_trade._get_paper_state_path") as mock_path:
                mock_path.return_value = state_path

                result = stop_paper_trading()

                assert result["ok"] is False
                assert "No active" in result["error"]

    def test_paper_status_inactive(self):
        """Test paper trading status when inactive."""
        from stanley.nautilus.paper_trade import get_paper_status

        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "paper_trading.json"

            with patch("stanley.nautilus.paper_trade._get_paper_state_path") as mock_path:
                mock_path.return_value = state_path

                result = get_paper_status()

                assert result["ok"] is True
                assert result["data"]["active"] is False

    def test_full_paper_trading_cycle(self):
        """Test complete paper trading cycle: start -> status -> stop."""
        from stanley.nautilus.paper_trade import (
            start_paper_trading,
            get_paper_status,
            stop_paper_trading,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            state_path = Path(tmpdir) / "paper_trading.json"

            with patch("stanley.nautilus.paper_trade._get_paper_state_path") as mock_path:
                mock_path.return_value = state_path

                # Start
                start_result = start_paper_trading("sma_crossover", ["AAPL", "MSFT"], 50000)
                assert start_result["ok"] is True

                # Status
                status_result = get_paper_status()
                assert status_result["ok"] is True
                assert status_result["data"]["active"] is True
                assert status_result["data"]["starting_capital"] == 50000

                # Stop
                stop_result = stop_paper_trading()
                assert stop_result["ok"] is True
                assert "starting_capital" in stop_result["data"]

                # Verify inactive
                final_status = get_paper_status()
                assert final_status["data"]["active"] is False
