"""
Stock screening functionality.
"""

from typing import Any


PREDEFINED_SCREENS = {
    "value": {"pe_ratio_lt": 15, "pb_ratio_lt": 1.5, "dividend_yield_gt": 2},
    "growth": {"revenue_growth_gt": 20, "eps_growth_gt": 15},
    "dividend": {"dividend_yield_gt": 3, "payout_ratio_lt": 80},
    "momentum": {"price_change_52w_gt": 20},
    "quality": {"roe_gt": 15, "debt_to_equity_lt": 0.5},
    "large_cap": {"market_cap_gt": 10000000000},
    "small_cap": {"market_cap_lt": 2000000000, "market_cap_gt": 300000000},
}


def screen_stocks(criteria: str) -> dict[str, Any]:
    """
    Screen stocks based on criteria.

    Args:
        criteria: Screen criteria (e.g., "value", "growth", "pe<15 dividend>2")

    Returns:
        Dictionary containing matching stocks
    """
    try:
        from openbb import obb

        # Check for predefined screen
        criteria_lower = criteria.lower().strip()
        if criteria_lower in PREDEFINED_SCREENS:
            screen_params = PREDEFINED_SCREENS[criteria_lower]
            return _run_screen(screen_params)

        # Parse custom criteria
        screen_params = _parse_criteria(criteria)
        if not screen_params:
            return {
                "ok": False,
                "error": f"Could not parse criteria: {criteria}. "
                f"Try predefined screens: {', '.join(PREDEFINED_SCREENS.keys())}",
            }

        return _run_screen(screen_params)

    except ImportError:
        return {"ok": False, "error": "OpenBB not installed. Run: pip install openbb"}
    except Exception as e:
        return {"ok": False, "error": f"Failed to screen stocks: {str(e)}"}


def _parse_criteria(criteria: str) -> dict[str, Any]:
    """Parse custom screening criteria."""
    params: dict[str, Any] = {}

    # Simple parser for criteria like "pe<15 dividend>2"
    import re

    patterns = [
        (r"pe\s*[<]\s*(\d+\.?\d*)", "pe_ratio_lt"),
        (r"pe\s*[>]\s*(\d+\.?\d*)", "pe_ratio_gt"),
        (r"pb\s*[<]\s*(\d+\.?\d*)", "pb_ratio_lt"),
        (r"pb\s*[>]\s*(\d+\.?\d*)", "pb_ratio_gt"),
        (r"dividend\s*[>]\s*(\d+\.?\d*)", "dividend_yield_gt"),
        (r"dividend\s*[<]\s*(\d+\.?\d*)", "dividend_yield_lt"),
        (r"roe\s*[>]\s*(\d+\.?\d*)", "roe_gt"),
        (r"market_cap\s*[>]\s*(\d+\.?\d*[BMK]?)", "market_cap_gt"),
        (r"market_cap\s*[<]\s*(\d+\.?\d*[BMK]?)", "market_cap_lt"),
    ]

    for pattern, param_name in patterns:
        match = re.search(pattern, criteria.lower())
        if match:
            value = match.group(1)
            # Handle market cap suffixes
            if "market_cap" in param_name:
                if value.upper().endswith("B"):
                    value = float(value[:-1]) * 1_000_000_000
                elif value.upper().endswith("M"):
                    value = float(value[:-1]) * 1_000_000
                elif value.upper().endswith("K"):
                    value = float(value[:-1]) * 1_000
            params[param_name] = float(value)

    return params


def _run_screen(params: dict[str, Any]) -> dict[str, Any]:
    """Run a stock screen with given parameters."""
    try:
        from openbb import obb

        # Use OpenBB screener
        results = obb.equity.screener(
            provider="yfinance",
        )

        if results and hasattr(results, "results"):
            stocks = []
            for stock in results.results[:50]:  # Limit results
                stock_data = {
                    "symbol": getattr(stock, "symbol", None),
                    "name": getattr(stock, "name", None),
                    "price": getattr(stock, "price", None),
                    "market_cap": getattr(stock, "market_cap", None),
                    "pe_ratio": getattr(stock, "pe_ratio", None),
                    "volume": getattr(stock, "volume", None),
                }

                # Filter based on params
                include = True
                for param, value in params.items():
                    metric_name = param.replace("_gt", "").replace("_lt", "")
                    metric_value = stock_data.get(metric_name)
                    if metric_value is not None:
                        if "_gt" in param and metric_value <= value:
                            include = False
                            break
                        if "_lt" in param and metric_value >= value:
                            include = False
                            break

                if include:
                    stocks.append(stock_data)

            return {
                "ok": True,
                "data": {
                    "criteria": params,
                    "count": len(stocks),
                    "stocks": stocks[:20],  # Return top 20
                },
            }

        return {"ok": False, "error": "No results from screener"}

    except Exception as e:
        return {"ok": False, "error": f"Screener failed: {str(e)}"}
