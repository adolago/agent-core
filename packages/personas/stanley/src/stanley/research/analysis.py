"""
Company analysis combining multiple data sources.
"""

from typing import Any


def analyze_company(ticker: str, filing_type: str = "10-K") -> dict[str, Any]:
    """
    Analyze a company using fundamentals and SEC filings.

    Args:
        ticker: Company ticker symbol
        filing_type: Primary filing type to analyze

    Returns:
        Dictionary containing analysis:
        - company_overview: Basic info
        - financial_highlights: Key metrics
        - recent_filings: List of recent SEC filings
        - analyst_ratings: Consensus ratings (if available)
        - risk_factors: Key risks from filings
    """
    try:
        from stanley.market.fundamentals import get_fundamentals
        from stanley.research.sec import list_sec_filings

        analysis: dict[str, Any] = {"ticker": ticker.upper()}

        # Get fundamentals
        fundamentals = get_fundamentals(ticker)
        if fundamentals.get("ok"):
            data = fundamentals.get("data", {})
            analysis["company_overview"] = {
                "name": data.get("name"),
                "sector": data.get("sector"),
                "industry": data.get("industry"),
                "employees": data.get("employees"),
                "description": data.get("description"),
            }
            analysis["financial_highlights"] = {
                "market_cap": data.get("market_cap"),
                "pe_ratio": data.get("pe_ratio"),
                "pb_ratio": data.get("pb_ratio"),
                "eps": data.get("eps"),
                "dividend_yield": data.get("dividend_yield"),
                "roe": data.get("roe"),
                "debt_to_equity": data.get("debt_to_equity"),
            }

        # Get recent filings
        filings = list_sec_filings(ticker, form_type="all", limit=5)
        if filings.get("ok"):
            analysis["recent_filings"] = filings.get("data", {}).get("filings", [])

        # Try to get analyst ratings
        try:
            from openbb import obb

            ratings_result = obb.equity.estimates.consensus(symbol=ticker)
            if ratings_result and hasattr(ratings_result, "results") and ratings_result.results:
                rating = ratings_result.results[0]
                analysis["analyst_consensus"] = {
                    "rating": getattr(rating, "rating", None),
                    "target_price": getattr(rating, "target_high", None),
                    "target_low": getattr(rating, "target_low", None),
                    "target_mean": getattr(rating, "target_mean", None),
                }
        except Exception:
            pass

        # Try to get earnings estimates
        try:
            from openbb import obb

            earnings_result = obb.equity.estimates.forward_eps(symbol=ticker)
            if earnings_result and hasattr(earnings_result, "results") and earnings_result.results:
                analysis["earnings_estimates"] = [
                    {
                        "period": getattr(e, "period", None),
                        "eps_estimate": getattr(e, "mean", None),
                    }
                    for e in earnings_result.results[:4]
                ]
        except Exception:
            pass

        return {"ok": True, "data": analysis}

    except Exception as e:
        return {"ok": False, "error": f"Failed to analyze {ticker}: {str(e)}"}
