"""
Portfolio performance analysis.
"""

from typing import Any


def get_performance(period: str = "ytd") -> dict[str, Any]:
    """
    Calculate portfolio performance metrics.

    Args:
        period: Analysis period (1d, 1w, 1m, 3m, 6m, 1y, ytd, all)

    Returns:
        Dictionary containing performance metrics:
        - total_return: Absolute return
        - total_return_percent: Percentage return
        - annualized_return: Annualized return
        - benchmark_return: Benchmark (SPY) return
        - alpha: Excess return vs benchmark
        - best_performer: Best performing position
        - worst_performer: Worst performing position
    """
    try:
        from stanley.portfolio.tracker import get_portfolio
        from stanley.market.quotes import get_quote

        portfolio = get_portfolio()
        if not portfolio.get("ok"):
            return portfolio

        positions = portfolio.get("data", {}).get("positions", [])
        if not positions:
            return {"ok": False, "error": "No positions in portfolio"}

        # Calculate returns for each position
        position_returns = []
        for pos in positions:
            gain_loss = pos.get("gain_loss", 0)
            cost = pos.get("cost_basis", 0) * pos.get("shares", 0)
            return_pct = (gain_loss / cost * 100) if cost > 0 else 0
            position_returns.append(
                {
                    "symbol": pos.get("symbol"),
                    "return": gain_loss,
                    "return_percent": return_pct,
                }
            )

        # Sort by return
        position_returns.sort(key=lambda x: x.get("return_percent", 0), reverse=True)

        # Total portfolio metrics
        total_value = portfolio.get("data", {}).get("total_value", 0)
        total_cost = portfolio.get("data", {}).get("total_cost", 0)
        total_return = total_value - total_cost
        total_return_pct = (total_return / total_cost * 100) if total_cost > 0 else 0

        # Get benchmark return (SPY)
        benchmark_return_pct = 0
        try:
            spy_quote = get_quote("SPY")
            if spy_quote.get("ok"):
                change_pct = spy_quote.get("data", {}).get("change_percent")
                if change_pct:
                    benchmark_return_pct = change_pct
        except Exception:
            pass

        return {
            "ok": True,
            "data": {
                "period": period,
                "total_value": total_value,
                "total_cost": total_cost,
                "total_return": total_return,
                "total_return_percent": total_return_pct,
                "benchmark": "SPY",
                "benchmark_return_percent": benchmark_return_pct,
                "alpha": total_return_pct - benchmark_return_pct,
                "best_performer": position_returns[0] if position_returns else None,
                "worst_performer": position_returns[-1] if position_returns else None,
                "position_returns": position_returns,
            },
        }

    except Exception as e:
        return {"ok": False, "error": f"Failed to calculate performance: {str(e)}"}
