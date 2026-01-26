"""
Fundamental data retrieval via OpenBB Platform.
"""

from typing import Any


def get_fundamentals(symbol: str) -> dict[str, Any]:
    """
    Get fundamental data for a symbol.

    Args:
        symbol: Stock ticker symbol

    Returns:
        Dictionary containing fundamental metrics:
        - market_cap
        - pe_ratio
        - pb_ratio
        - dividend_yield
        - eps
        - revenue
        - profit_margin
        - etc.
    """
    try:
        from openbb import obb

        # Get company profile/overview
        profile_result = obb.equity.profile(symbol=symbol)
        fundamentals: dict[str, Any] = {"symbol": symbol.upper()}

        if profile_result and hasattr(profile_result, "results") and profile_result.results:
            profile = profile_result.results[0]
            fundamentals.update(
                {
                    "name": getattr(profile, "name", None),
                    "sector": getattr(profile, "sector", None),
                    "industry": getattr(profile, "industry", None),
                    "market_cap": getattr(profile, "market_cap", None),
                    "employees": getattr(profile, "employees", None),
                    "description": getattr(profile, "description", None),
                }
            )

        # Get key metrics
        try:
            metrics_result = obb.equity.fundamental.metrics(symbol=symbol)
            if metrics_result and hasattr(metrics_result, "results") and metrics_result.results:
                metrics = metrics_result.results[0]
                fundamentals.update(
                    {
                        "pe_ratio": getattr(metrics, "pe_ratio_ttm", None),
                        "pb_ratio": getattr(metrics, "pb_ratio", None),
                        "ps_ratio": getattr(metrics, "ps_ratio_ttm", None),
                        "peg_ratio": getattr(metrics, "peg_ratio", None),
                        "eps": getattr(metrics, "eps_diluted_ttm", None),
                        "dividend_yield": getattr(metrics, "dividend_yield_ttm", None),
                        "revenue_per_share": getattr(metrics, "revenue_per_share_ttm", None),
                        "book_value_per_share": getattr(metrics, "book_value_per_share", None),
                        "roe": getattr(metrics, "roe_ttm", None),
                        "roa": getattr(metrics, "roa_ttm", None),
                        "debt_to_equity": getattr(metrics, "debt_to_equity", None),
                        "current_ratio": getattr(metrics, "current_ratio", None),
                        "quick_ratio": getattr(metrics, "quick_ratio", None),
                    }
                )
        except Exception:
            pass  # Metrics may not be available for all symbols

        return {"ok": True, "data": fundamentals}

    except ImportError:
        return {"ok": False, "error": "OpenBB not installed. Run: pip install openbb"}
    except Exception as e:
        return {"ok": False, "error": f"Failed to get fundamentals for {symbol}: {str(e)}"}
