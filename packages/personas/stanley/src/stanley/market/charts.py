"""
Historical price chart retrieval via OpenBB Platform.
"""

from typing import Any


PERIOD_MAP = {
    "1d": 1,
    "5d": 5,
    "1m": 30,
    "3m": 90,
    "6m": 180,
    "1y": 365,
    "ytd": "ytd",
    "max": "max",
}


def get_chart(symbol: str, period: str = "1m", interval: str = "1d") -> dict[str, Any]:
    """
    Get historical price chart for a symbol.

    Args:
        symbol: Stock ticker symbol
        period: Time period (1d, 5d, 1m, 3m, 6m, 1y, ytd, max)
        interval: Data interval (1m, 5m, 15m, 1h, 1d, 1w)

    Returns:
        Dictionary containing OHLCV data
    """
    try:
        from openbb import obb
        from datetime import datetime, timedelta

        # Calculate start date based on period
        end_date = datetime.now()
        if period == "ytd":
            start_date = datetime(end_date.year, 1, 1)
        elif period == "max":
            start_date = datetime(2000, 1, 1)  # Default max lookback
        else:
            days = PERIOD_MAP.get(period, 30)
            if isinstance(days, int):
                start_date = end_date - timedelta(days=days)
            else:
                start_date = end_date - timedelta(days=30)

        # Get historical data
        result = obb.equity.price.historical(
            symbol=symbol,
            start_date=start_date.strftime("%Y-%m-%d"),
            end_date=end_date.strftime("%Y-%m-%d"),
            interval=interval,
        )

        if result and hasattr(result, "results") and result.results:
            data_points = []
            for row in result.results:
                data_points.append(
                    {
                        "date": str(getattr(row, "date", "")),
                        "open": getattr(row, "open", None),
                        "high": getattr(row, "high", None),
                        "low": getattr(row, "low", None),
                        "close": getattr(row, "close", None),
                        "volume": getattr(row, "volume", None),
                    }
                )

            return {
                "ok": True,
                "data": {
                    "symbol": symbol.upper(),
                    "period": period,
                    "interval": interval,
                    "count": len(data_points),
                    "prices": data_points,
                },
            }

        return {"ok": False, "error": f"No chart data found for {symbol}"}
    except ImportError:
        return {"ok": False, "error": "OpenBB not installed. Run: pip install openbb"}
    except Exception as e:
        return {"ok": False, "error": f"Failed to get chart for {symbol}: {str(e)}"}
