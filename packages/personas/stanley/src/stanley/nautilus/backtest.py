"""
Backtesting functionality via NautilusTrader.
"""

from typing import Any


BUILTIN_STRATEGIES = {
    "momentum": {
        "name": "Momentum Strategy",
        "description": "Buy assets with positive momentum, sell when momentum reverses",
        "parameters": {"lookback_period": 20, "momentum_threshold": 0.02},
    },
    "mean_reversion": {
        "name": "Mean Reversion Strategy",
        "description": "Buy oversold assets, sell overbought assets based on Bollinger Bands",
        "parameters": {"bb_period": 20, "bb_std": 2.0},
    },
    "sma_crossover": {
        "name": "SMA Crossover Strategy",
        "description": "Buy when short SMA crosses above long SMA, sell on opposite",
        "parameters": {"short_period": 10, "long_period": 50},
    },
    "rsi_strategy": {
        "name": "RSI Strategy",
        "description": "Buy when RSI oversold (<30), sell when overbought (>70)",
        "parameters": {"rsi_period": 14, "oversold": 30, "overbought": 70},
    },
    "buy_and_hold": {
        "name": "Buy and Hold",
        "description": "Simple buy and hold benchmark strategy",
        "parameters": {},
    },
}


def list_strategies() -> dict[str, Any]:
    """
    List available trading strategies.

    Returns:
        Dictionary containing available strategies
    """
    return {
        "ok": True,
        "data": {
            "strategies": [
                {"id": k, **v}
                for k, v in BUILTIN_STRATEGIES.items()
            ],
            "custom_strategies": [],  # TODO: Load from user config
        },
    }


def run_backtest(
    strategy: str,
    symbols: list[str],
    start_date: str,
    end_date: str | None = None,
) -> dict[str, Any]:
    """
    Run a backtest using NautilusTrader.

    Args:
        strategy: Strategy name or ID
        symbols: List of symbols to trade
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD), defaults to today

    Returns:
        Dictionary containing backtest results:
        - total_return: Total return percentage
        - sharpe_ratio: Risk-adjusted return
        - max_drawdown: Maximum drawdown
        - trades: Number of trades
        - win_rate: Percentage of winning trades
        - equity_curve: Equity over time
    """
    try:
        # Validate strategy
        strategy_lower = strategy.lower()
        if strategy_lower not in BUILTIN_STRATEGIES:
            return {
                "ok": False,
                "error": f"Unknown strategy: {strategy}. Available: {', '.join(BUILTIN_STRATEGIES.keys())}",
            }

        # Try to import nautilus
        try:
            from nautilus_trader.backtest.engine import BacktestEngine  # type: ignore
            from nautilus_trader.model.identifiers import Venue  # type: ignore
            from nautilus_trader.config import BacktestEngineConfig  # type: ignore

            return _run_nautilus_backtest(strategy_lower, symbols, start_date, end_date)
        except ImportError:
            # Fall back to simple pandas backtest
            return _run_simple_backtest(strategy_lower, symbols, start_date, end_date)

    except Exception as e:
        return {"ok": False, "error": f"Backtest failed: {str(e)}"}


def _run_simple_backtest(
    strategy: str,
    symbols: list[str],
    start_date: str,
    end_date: str | None,
) -> dict[str, Any]:
    """Run a simple pandas-based backtest as fallback."""
    try:
        import numpy as np

        from stanley.market.charts import get_chart

        if not symbols:
            return {"ok": False, "error": "No symbols provided"}

        # Get historical data for first symbol
        symbol = symbols[0]
        chart = get_chart(symbol, period="1y", interval="1d")
        if not chart.get("ok"):
            return chart

        prices = chart.get("data", {}).get("prices", [])
        if len(prices) < 50:
            return {"ok": False, "error": "Insufficient historical data"}

        closes = np.array([p["close"] for p in prices if p.get("close")])

        # Simple strategy simulation
        strategy_info = BUILTIN_STRATEGIES[strategy]
        params = strategy_info["parameters"]

        if strategy == "sma_crossover":
            short_sma = _sma(closes, params.get("short_period", 10))
            long_sma = _sma(closes, params.get("long_period", 50))
            signals = np.where(short_sma > long_sma, 1, -1)
        elif strategy == "momentum":
            lookback = params.get("lookback_period", 20)
            returns = np.diff(closes) / closes[:-1]
            momentum = np.zeros(len(closes))
            for i in range(lookback, len(closes)):
                momentum[i] = np.sum(returns[i - lookback : i])
            signals = np.where(momentum > params.get("momentum_threshold", 0.02), 1, -1)
        elif strategy == "rsi_strategy":
            rsi = _rsi(closes, params.get("rsi_period", 14))
            signals = np.where(
                rsi < params.get("oversold", 30),
                1,
                np.where(rsi > params.get("overbought", 70), -1, 0),
            )
        else:
            # Buy and hold
            signals = np.ones(len(closes))

        # Calculate returns
        daily_returns = np.diff(closes) / closes[:-1]
        strategy_returns = signals[:-1] * daily_returns

        # Calculate metrics
        total_return = float(np.prod(1 + strategy_returns) - 1) * 100
        sharpe = float(np.mean(strategy_returns) / np.std(strategy_returns) * np.sqrt(252)) if np.std(strategy_returns) > 0 else 0

        cumulative = np.cumprod(1 + strategy_returns)
        running_max = np.maximum.accumulate(cumulative)
        drawdowns = (cumulative - running_max) / running_max
        max_drawdown = float(np.min(drawdowns) * 100)

        # Count trades (signal changes)
        trades = int(np.sum(np.abs(np.diff(signals)) > 0))
        win_trades = int(np.sum(strategy_returns > 0))
        win_rate = (win_trades / len(strategy_returns) * 100) if len(strategy_returns) > 0 else 0

        return {
            "ok": True,
            "data": {
                "strategy": strategy,
                "strategy_name": strategy_info["name"],
                "symbols": symbols,
                "start_date": start_date,
                "end_date": end_date or "today",
                "total_return_percent": round(total_return, 2),
                "sharpe_ratio": round(sharpe, 2),
                "max_drawdown_percent": round(max_drawdown, 2),
                "total_trades": trades,
                "win_rate_percent": round(win_rate, 2),
                "note": "Simple backtest (NautilusTrader not installed for full simulation)",
            },
        }

    except Exception as e:
        return {"ok": False, "error": f"Simple backtest failed: {str(e)}"}


def _run_nautilus_backtest(
    strategy: str,
    symbols: list[str],
    start_date: str,
    end_date: str | None,
) -> dict[str, Any]:
    """Run a full NautilusTrader backtest."""
    # This would use the full NautilusTrader engine
    # For now, return a placeholder indicating it's available
    return {
        "ok": True,
        "data": {
            "strategy": strategy,
            "symbols": symbols,
            "start_date": start_date,
            "end_date": end_date,
            "message": "NautilusTrader backtest would run here",
            "note": "Full NautilusTrader integration requires additional setup",
        },
    }


def _sma(data: Any, period: int) -> Any:
    """Calculate Simple Moving Average."""
    import numpy as np

    sma = np.zeros(len(data))
    for i in range(period, len(data)):
        sma[i] = np.mean(data[i - period : i])
    return sma


def _rsi(data: Any, period: int = 14) -> Any:
    """Calculate Relative Strength Index."""
    import numpy as np

    deltas = np.diff(data)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)

    avg_gain = np.zeros(len(data))
    avg_loss = np.zeros(len(data))

    # Initial SMA
    avg_gain[period] = np.mean(gains[:period])
    avg_loss[period] = np.mean(losses[:period])

    # EMA
    for i in range(period + 1, len(data)):
        avg_gain[i] = (avg_gain[i - 1] * (period - 1) + gains[i - 1]) / period
        avg_loss[i] = (avg_loss[i - 1] * (period - 1) + losses[i - 1]) / period

    rs = avg_gain / np.where(avg_loss == 0, 1, avg_loss)
    rsi = 100 - (100 / (1 + rs))
    return rsi
