"""
Real-time quote retrieval via OpenBB Platform.
"""

from typing import Any


def get_quote(symbol: str) -> dict[str, Any]:
    """
    Get real-time quote for a single symbol.

    Args:
        symbol: Stock ticker symbol (e.g., AAPL, MSFT)

    Returns:
        Dictionary containing quote data:
        - symbol: Ticker symbol
        - price: Current price
        - change: Price change
        - change_percent: Percentage change
        - volume: Trading volume
        - market_cap: Market capitalization
        - pe_ratio: P/E ratio
        - timestamp: Quote timestamp
    """
    try:
        from openbb import obb

        # Get quote data from OpenBB
        result = obb.equity.price.quote(symbol=symbol)
        if result and hasattr(result, "results") and result.results:
            data = result.results[0]
            return {
                "ok": True,
                "data": {
                    "symbol": symbol.upper(),
                    "price": getattr(data, "last_price", None) or getattr(data, "price", None),
                    "change": getattr(data, "change", None),
                    "change_percent": getattr(data, "change_percent", None),
                    "volume": getattr(data, "volume", None),
                    "high": getattr(data, "high", None),
                    "low": getattr(data, "low", None),
                    "open": getattr(data, "open", None),
                    "previous_close": getattr(data, "prev_close", None),
                    "market_cap": getattr(data, "market_cap", None),
                    "pe_ratio": getattr(data, "pe", None),
                    "timestamp": str(getattr(data, "timestamp", "")),
                },
            }
        return {"ok": False, "error": f"No quote data found for {symbol}"}
    except ImportError:
        return {"ok": False, "error": "OpenBB not installed. Run: pip install openbb"}
    except Exception as e:
        return {"ok": False, "error": f"Failed to get quote for {symbol}: {str(e)}"}


def get_quotes(symbols: list[str]) -> dict[str, Any]:
    """
    Get real-time quotes for multiple symbols.

    Args:
        symbols: List of ticker symbols

    Returns:
        Dictionary containing quotes for all symbols
    """
    results = []
    errors = []

    for symbol in symbols:
        quote = get_quote(symbol)
        if quote.get("ok"):
            results.append(quote["data"])
        else:
            errors.append({"symbol": symbol, "error": quote.get("error")})

    return {
        "ok": len(results) > 0,
        "data": {"quotes": results, "errors": errors if errors else None},
    }
