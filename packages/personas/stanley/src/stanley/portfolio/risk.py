"""
Portfolio risk metrics calculation.
"""

from typing import Any


def calculate_risk_metrics(confidence: float = 0.95) -> dict[str, Any]:
    """
    Calculate portfolio risk metrics.

    Args:
        confidence: Confidence level for VaR (0.95 = 95%)

    Returns:
        Dictionary containing risk metrics:
        - var: Value at Risk
        - cvar: Conditional VaR (Expected Shortfall)
        - sharpe_ratio: Risk-adjusted return
        - sortino_ratio: Downside risk-adjusted return
        - max_drawdown: Maximum peak-to-trough decline
        - beta: Portfolio beta vs benchmark
        - volatility: Portfolio standard deviation
    """
    try:
        import numpy as np

        from stanley.portfolio.tracker import get_portfolio
        from stanley.market.charts import get_chart

        portfolio = get_portfolio()
        if not portfolio.get("ok"):
            return portfolio

        positions = portfolio.get("data", {}).get("positions", [])
        if not positions:
            return {"ok": False, "error": "No positions in portfolio"}

        # Get historical returns for each position
        all_returns: list[list[float]] = []
        weights: list[float] = []
        total_value = portfolio.get("data", {}).get("total_value", 0)

        if total_value == 0:
            return {"ok": False, "error": "Portfolio has no value"}

        for pos in positions:
            symbol = pos.get("symbol")
            market_value = pos.get("market_value", 0)
            weight = market_value / total_value if total_value > 0 else 0
            weights.append(weight)

            # Get 1-year historical data
            chart = get_chart(symbol, period="1y", interval="1d")
            if chart.get("ok"):
                prices = [p.get("close") for p in chart.get("data", {}).get("prices", []) if p.get("close")]
                if len(prices) > 1:
                    returns = [(prices[i] - prices[i - 1]) / prices[i - 1] for i in range(1, len(prices))]
                    all_returns.append(returns)
                else:
                    all_returns.append([0.0])
            else:
                all_returns.append([0.0])

        # Calculate portfolio returns (weighted)
        if not all_returns or not weights:
            return {"ok": False, "error": "Insufficient data for risk calculation"}

        # Normalize return lengths
        min_len = min(len(r) for r in all_returns)
        if min_len < 10:
            return {"ok": False, "error": "Insufficient historical data (need at least 10 days)"}

        portfolio_returns = np.zeros(min_len)
        for i, (returns, weight) in enumerate(zip(all_returns, weights)):
            portfolio_returns += np.array(returns[:min_len]) * weight

        # Calculate metrics
        mean_return = float(np.mean(portfolio_returns))
        std_return = float(np.std(portfolio_returns))

        # VaR (parametric, assuming normal distribution)
        from scipy import stats  # type: ignore

        z_score = stats.norm.ppf(1 - confidence)
        var = float(-z_score * std_return * total_value)

        # CVaR (Expected Shortfall)
        sorted_returns = np.sort(portfolio_returns)
        var_idx = int((1 - confidence) * len(sorted_returns))
        cvar = float(-np.mean(sorted_returns[:var_idx]) * total_value) if var_idx > 0 else var

        # Sharpe Ratio (assuming risk-free rate of 4%)
        risk_free_rate = 0.04 / 252  # Daily risk-free rate
        excess_return = mean_return - risk_free_rate
        sharpe = float(excess_return / std_return * np.sqrt(252)) if std_return > 0 else 0

        # Sortino Ratio (downside deviation)
        downside_returns = portfolio_returns[portfolio_returns < 0]
        downside_std = float(np.std(downside_returns)) if len(downside_returns) > 0 else std_return
        sortino = float(excess_return / downside_std * np.sqrt(252)) if downside_std > 0 else 0

        # Max Drawdown
        cumulative = np.cumprod(1 + portfolio_returns)
        running_max = np.maximum.accumulate(cumulative)
        drawdowns = (cumulative - running_max) / running_max
        max_drawdown = float(np.min(drawdowns) * 100)

        # Volatility (annualized)
        volatility = float(std_return * np.sqrt(252) * 100)

        return {
            "ok": True,
            "data": {
                "confidence_level": confidence,
                "var": var,
                "var_percent": (var / total_value * 100) if total_value > 0 else 0,
                "cvar": cvar,
                "cvar_percent": (cvar / total_value * 100) if total_value > 0 else 0,
                "sharpe_ratio": sharpe,
                "sortino_ratio": sortino,
                "max_drawdown_percent": max_drawdown,
                "volatility_percent": volatility,
                "daily_mean_return_percent": mean_return * 100,
                "total_portfolio_value": total_value,
            },
        }

    except ImportError as e:
        missing = str(e).split("'")[-2] if "'" in str(e) else "required package"
        return {"ok": False, "error": f"Missing dependency: {missing}. Install with: pip install numpy scipy"}
    except Exception as e:
        return {"ok": False, "error": f"Failed to calculate risk metrics: {str(e)}"}
