"""
FFI layer for external APIs.

All core logic (portfolio tracking, risk metrics, indicators, paper trading)
is now in Rust via stanley-core. This module provides Python wrappers for:

1. External market data APIs (OpenBB)
2. SEC Edgar filings
3. NautilusTrader (when available)

The Rust CLI is called for core operations, and this module handles external
data that requires Python libraries.
"""

import json
import subprocess
from pathlib import Path
from typing import Any


# ============================================================================
# Configuration
# ============================================================================

def get_stanley_cli_path() -> str:
    """Get path to the stanley Rust CLI binary."""
    import shutil

    # Check common locations
    paths = [
        Path.home() / ".cargo" / "bin" / "stanley",
        Path.home() / "bin" / "stanley",
        Path("/usr/local/bin/stanley"),
    ]

    for path in paths:
        if path.exists():
            return str(path)

    # Fall back to PATH lookup
    found = shutil.which("stanley")
    if found:
        return found

    raise FileNotFoundError(
        "Stanley CLI not found. Build with: cd packages/stanley-core && cargo build --release --features cli"
    )


def call_rust_cli(args: list[str]) -> dict[str, Any]:
    """Call the Stanley Rust CLI and parse JSON output."""
    try:
        cli_path = get_stanley_cli_path()
        result = subprocess.run(
            [cli_path] + args,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return json.loads(result.stdout)
    except FileNotFoundError as e:
        return {"ok": False, "error": str(e)}
    except json.JSONDecodeError:
        return {"ok": False, "error": "Failed to parse CLI output"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "CLI command timed out"}
    except Exception as e:
        return {"ok": False, "error": f"CLI error: {str(e)}"}


# ============================================================================
# OpenBB Market Data
# ============================================================================

def fetch_quote(symbol: str) -> dict[str, Any]:
    """
    Get real-time quote from OpenBB.

    Args:
        symbol: Stock ticker symbol

    Returns:
        Quote data including price, change, volume
    """
    try:
        from openbb import obb

        data = obb.equity.price.quote(symbol, provider="yfinance")
        if hasattr(data, 'to_dict'):
            result = data.to_dict()
        elif hasattr(data, 'model_dump'):
            result = data.model_dump()
        else:
            result = dict(data)

        return {"ok": True, "data": result}
    except ImportError:
        return {"ok": False, "error": "OpenBB not installed. Install with: pip install openbb"}
    except Exception as e:
        return {"ok": False, "error": f"Failed to fetch quote: {str(e)}"}


def fetch_quotes(symbols: list[str]) -> dict[str, Any]:
    """
    Get real-time quotes for multiple symbols.

    Args:
        symbols: List of stock ticker symbols

    Returns:
        Dict mapping symbols to their quote data
    """
    results = {}
    for symbol in symbols:
        quote = fetch_quote(symbol)
        if quote.get("ok"):
            results[symbol] = quote.get("data", {})
    return {"ok": True, "data": results}


def fetch_historical(
    symbol: str,
    start_date: str,
    end_date: str | None = None,
    interval: str = "1d"
) -> dict[str, Any]:
    """
    Get historical OHLCV data from OpenBB.

    Args:
        symbol: Stock ticker symbol
        start_date: Start date (YYYY-MM-DD)
        end_date: End date (YYYY-MM-DD), defaults to today
        interval: Data interval (1d, 1h, 5m, etc.)

    Returns:
        Historical price data
    """
    try:
        from openbb import obb

        kwargs = {
            "symbol": symbol,
            "start_date": start_date,
            "provider": "yfinance",
        }
        if end_date:
            kwargs["end_date"] = end_date

        data = obb.equity.price.historical(**kwargs)

        if hasattr(data, 'to_list'):
            result = data.to_list()
        elif hasattr(data, 'model_dump'):
            result = data.model_dump()
        else:
            result = list(data)

        return {"ok": True, "data": {"prices": result}}
    except ImportError:
        return {"ok": False, "error": "OpenBB not installed. Install with: pip install openbb"}
    except Exception as e:
        return {"ok": False, "error": f"Failed to fetch historical data: {str(e)}"}


def fetch_returns(symbol: str, period: str = "1y") -> dict[str, Any]:
    """
    Get daily returns for a symbol over a period.

    Args:
        symbol: Stock ticker symbol
        period: Lookback period (1y, 6m, 3m, 1m)

    Returns:
        List of daily returns
    """
    try:
        from openbb import obb
        from datetime import datetime, timedelta

        # Calculate start date from period
        today = datetime.now()
        period_days = {
            "1y": 365,
            "6m": 180,
            "3m": 90,
            "1m": 30,
        }
        days = period_days.get(period, 365)
        start_date = (today - timedelta(days=days)).strftime("%Y-%m-%d")

        data = obb.equity.price.historical(
            symbol=symbol,
            start_date=start_date,
            provider="yfinance",
        )

        if hasattr(data, 'to_list'):
            prices = data.to_list()
        else:
            prices = list(data)

        # Calculate returns
        closes = [p.get("close") for p in prices if p.get("close")]
        if len(closes) < 2:
            return {"ok": False, "error": "Insufficient price data"}

        returns = [(closes[i] - closes[i-1]) / closes[i-1] for i in range(1, len(closes))]

        return {"ok": True, "data": {"returns": returns, "count": len(returns)}}
    except ImportError:
        return {"ok": False, "error": "OpenBB not installed. Install with: pip install openbb"}
    except Exception as e:
        return {"ok": False, "error": f"Failed to calculate returns: {str(e)}"}


# ============================================================================
# SEC Edgar
# ============================================================================

def download_sec_filing(
    ticker: str,
    form_type: str = "10-K",
    num_filings: int = 1
) -> dict[str, Any]:
    """
    Download SEC filing content.

    Args:
        ticker: Company ticker symbol
        form_type: Filing type (10-K, 10-Q, 8-K, etc.)
        num_filings: Number of recent filings to download

    Returns:
        Filing content and metadata
    """
    try:
        from sec_edgar_downloader import Downloader
        import tempfile
        import os

        # Use temp directory for downloads
        with tempfile.TemporaryDirectory() as tmpdir:
            dl = Downloader(tmpdir, "stanley@example.com")
            dl.get(form_type, ticker, num_filings)

            # Find downloaded files
            filings = []
            for root, dirs, files in os.walk(tmpdir):
                for file in files:
                    if file.endswith('.txt') or file.endswith('.html'):
                        filepath = os.path.join(root, file)
                        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                        filings.append({
                            "filename": file,
                            "content": content[:50000],  # Limit content size
                            "size": len(content),
                        })

            if not filings:
                return {"ok": False, "error": f"No {form_type} filings found for {ticker}"}

            return {"ok": True, "data": {"filings": filings, "ticker": ticker, "form_type": form_type}}
    except ImportError:
        return {"ok": False, "error": "sec-edgar-downloader not installed. Install with: pip install sec-edgar-downloader"}
    except Exception as e:
        return {"ok": False, "error": f"Failed to download filing: {str(e)}"}


def search_edgar(
    query: str,
    form_types: list[str] | None = None
) -> dict[str, Any]:
    """
    Search SEC EDGAR for filings.

    Args:
        query: Search query (company name or CIK)
        form_types: Optional list of form types to filter

    Returns:
        Search results with filing metadata
    """
    try:
        # Use OpenBB's SEC search if available
        from openbb import obb

        results = obb.equity.fundamental.filings(
            symbol=query,
            provider="sec",
        )

        if hasattr(results, 'to_list'):
            data = results.to_list()
        else:
            data = list(results)

        # Filter by form types if specified
        if form_types:
            data = [f for f in data if f.get("type") in form_types]

        return {"ok": True, "data": {"results": data[:20], "query": query}}
    except Exception as e:
        return {"ok": False, "error": f"EDGAR search failed: {str(e)}"}


# ============================================================================
# Portfolio with Live Prices (combines Rust + Python)
# ============================================================================

def get_portfolio_with_prices() -> dict[str, Any]:
    """
    Get portfolio from Rust CLI and enrich with live prices from OpenBB.

    This is the main entry point for getting complete portfolio data.
    """
    # Get portfolio from Rust
    portfolio = call_rust_cli(["portfolio", "status"])

    if not portfolio.get("ok"):
        return portfolio

    data = portfolio.get("data", {})
    positions = data.get("positions", [])

    if not positions:
        return portfolio

    # Fetch live prices
    symbols = [p.get("symbol") for p in positions if p.get("symbol")]
    quotes_result = fetch_quotes(symbols)
    quotes = quotes_result.get("data", {})

    # Enrich positions with current prices
    total_value = data.get("cash", 0)
    enriched_positions = []

    for pos in positions:
        symbol = pos.get("symbol")
        shares = pos.get("shares", 0)
        cost_basis = pos.get("cost_basis", 0)

        current_price = cost_basis  # Default to cost if no quote
        if symbol in quotes:
            quote_data = quotes[symbol]
            # Handle different OpenBB response formats
            if isinstance(quote_data, dict):
                current_price = quote_data.get("price") or quote_data.get("regularMarketPrice") or cost_basis
            elif hasattr(quote_data, "price"):
                current_price = quote_data.price

        market_value = shares * current_price
        gain_loss = market_value - (shares * cost_basis)
        gain_loss_percent = (gain_loss / (shares * cost_basis) * 100) if (shares * cost_basis) > 0 else 0

        enriched_positions.append({
            **pos,
            "current_price": current_price,
            "market_value": market_value,
            "gain_loss": gain_loss,
            "gain_loss_percent": gain_loss_percent,
        })

        total_value += market_value

    return {
        "ok": True,
        "data": {
            **data,
            "positions": enriched_positions,
            "total_value": total_value,
            "total_gain_loss": total_value - data.get("total_cost", 0) - data.get("cash", 0),
        }
    }


# ============================================================================
# Risk Metrics with Live Data (combines Rust + Python)
# ============================================================================

def calculate_risk_with_live_data(confidence: float = 0.95) -> dict[str, Any]:
    """
    Calculate risk metrics using live market data.

    1. Gets portfolio from Rust CLI
    2. Fetches historical returns from OpenBB
    3. Calls Rust risk calculation (or does it in Python if Rust binary unavailable)
    """
    # Get enriched portfolio
    portfolio = get_portfolio_with_prices()
    if not portfolio.get("ok"):
        return portfolio

    data = portfolio.get("data", {})
    positions = data.get("positions", [])
    total_value = data.get("total_value", 0)

    if not positions or total_value <= 0:
        return {"ok": False, "error": "No positions or zero portfolio value"}

    # Fetch returns for each position
    all_returns = []
    weights = []

    for pos in positions:
        symbol = pos.get("symbol")
        market_value = pos.get("market_value", 0)
        weight = market_value / total_value if total_value > 0 else 0
        weights.append(weight)

        returns_result = fetch_returns(symbol, "1y")
        if returns_result.get("ok"):
            all_returns.append(returns_result.get("data", {}).get("returns", []))
        else:
            all_returns.append([0.0])

    # Normalize return lengths
    if not all_returns:
        return {"ok": False, "error": "Could not fetch return data"}

    min_len = min(len(r) for r in all_returns)
    if min_len < 10:
        return {"ok": False, "error": "Insufficient historical data (need at least 10 days)"}

    # Calculate portfolio returns (weighted)
    try:
        import numpy as np
        from scipy import stats

        portfolio_returns = np.zeros(min_len)
        for returns, weight in zip(all_returns, weights):
            portfolio_returns += np.array(returns[:min_len]) * weight

        # Calculate metrics
        mean_return = float(np.mean(portfolio_returns))
        std_return = float(np.std(portfolio_returns))

        # VaR
        z_score = stats.norm.ppf(1 - confidence)
        var = float(-z_score * std_return * total_value)

        # CVaR
        sorted_returns = np.sort(portfolio_returns)
        var_idx = int((1 - confidence) * len(sorted_returns))
        cvar = float(-np.mean(sorted_returns[:var_idx]) * total_value) if var_idx > 0 else var

        # Sharpe
        risk_free_rate = 0.04 / 252
        excess_return = mean_return - risk_free_rate
        sharpe = float(excess_return / std_return * np.sqrt(252)) if std_return > 0 else 0

        # Sortino
        downside = portfolio_returns[portfolio_returns < 0]
        downside_std = float(np.std(downside)) if len(downside) > 0 else std_return
        sortino = float(excess_return / downside_std * np.sqrt(252)) if downside_std > 0 else 0

        # Max Drawdown
        cumulative = np.cumprod(1 + portfolio_returns)
        running_max = np.maximum.accumulate(cumulative)
        drawdowns = (cumulative - running_max) / running_max
        max_drawdown = float(np.min(drawdowns) * 100)

        # Volatility
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
            }
        }
    except ImportError as e:
        missing = str(e).split("'")[-2] if "'" in str(e) else "required package"
        return {"ok": False, "error": f"Missing dependency: {missing}. Install with: pip install numpy scipy"}
    except Exception as e:
        return {"ok": False, "error": f"Risk calculation failed: {str(e)}"}
