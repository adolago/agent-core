"""
Portfolio position tracking and persistence.
"""

import json
import os
from pathlib import Path
from typing import Any


def _get_portfolio_path() -> Path:
    """Get the path to the portfolio file."""
    portfolio_file = os.environ.get("STANLEY_PORTFOLIO_FILE")
    if portfolio_file:
        return Path(portfolio_file)
    return Path.home() / ".zee" / "stanley" / "portfolio.json"


def _load_portfolio() -> dict[str, Any]:
    """Load portfolio from disk."""
    path = _get_portfolio_path()
    if path.exists():
        try:
            with open(path) as f:
                data = json.load(f)
                # Handle legacy format (list of positions)
                if isinstance(data, list):
                    return {"positions": data, "cash": 0.0, "created_at": None, "updated_at": None}
                return data
        except (json.JSONDecodeError, IOError):
            pass
    return {"positions": [], "cash": 0.0, "created_at": None, "updated_at": None}


def _save_portfolio(portfolio: dict[str, Any]) -> None:
    """Save portfolio to disk."""
    from datetime import datetime

    path = _get_portfolio_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    if portfolio.get("created_at") is None:
        portfolio["created_at"] = datetime.now().isoformat()
    portfolio["updated_at"] = datetime.now().isoformat()

    with open(path, "w") as f:
        json.dump(portfolio, f, indent=2)


def get_portfolio() -> dict[str, Any]:
    """
    Get current portfolio status including all positions and summary.

    Returns:
        Dictionary containing portfolio data:
        - positions: List of holdings
        - total_value: Current market value
        - total_cost: Total cost basis
        - total_gain_loss: Unrealized P&L
        - cash: Cash balance
    """
    portfolio = _load_portfolio()
    positions = portfolio.get("positions", [])

    # Calculate current values
    total_cost = sum(p.get("cost_basis", 0) * p.get("shares", 0) for p in positions)
    total_value = total_cost  # Would need real-time quotes for accurate value

    # Try to get current prices
    try:
        from stanley.market.quotes import get_quote

        enriched_positions = []
        for pos in positions:
            quote = get_quote(pos["symbol"])
            current_price = pos.get("cost_basis", 0)
            if quote.get("ok") and quote.get("data", {}).get("price"):
                current_price = quote["data"]["price"]

            shares = pos.get("shares", 0)
            cost_basis = pos.get("cost_basis", 0)
            market_value = current_price * shares
            gain_loss = market_value - (cost_basis * shares)

            enriched_positions.append(
                {
                    **pos,
                    "current_price": current_price,
                    "market_value": market_value,
                    "gain_loss": gain_loss,
                    "gain_loss_percent": (gain_loss / (cost_basis * shares) * 100) if cost_basis * shares > 0 else 0,
                }
            )

        total_value = sum(p["market_value"] for p in enriched_positions)
        positions = enriched_positions
    except Exception:
        pass

    return {
        "ok": True,
        "data": {
            "positions": positions,
            "position_count": len(positions),
            "total_value": total_value,
            "total_cost": total_cost,
            "total_gain_loss": total_value - total_cost,
            "cash": portfolio.get("cash", 0),
            "updated_at": portfolio.get("updated_at"),
        },
    }


def get_positions() -> dict[str, Any]:
    """Get list of all positions."""
    portfolio = _load_portfolio()
    return {"ok": True, "data": {"positions": portfolio.get("positions", [])}}


def add_position(symbol: str, shares: float, cost_basis: float) -> dict[str, Any]:
    """
    Add or update a position in the portfolio.

    Args:
        symbol: Stock ticker symbol
        shares: Number of shares
        cost_basis: Cost per share

    Returns:
        Updated position data
    """
    portfolio = _load_portfolio()
    positions = portfolio.get("positions", [])

    # Check if position exists
    existing_idx = None
    for i, pos in enumerate(positions):
        if pos.get("symbol", "").upper() == symbol.upper():
            existing_idx = i
            break

    position = {
        "symbol": symbol.upper(),
        "shares": shares,
        "cost_basis": cost_basis,
    }

    if existing_idx is not None:
        # Update existing position (average down/up)
        old_pos = positions[existing_idx]
        old_shares = old_pos.get("shares", 0)
        old_cost = old_pos.get("cost_basis", 0)

        total_shares = old_shares + shares
        avg_cost = ((old_shares * old_cost) + (shares * cost_basis)) / total_shares if total_shares > 0 else 0

        position["shares"] = total_shares
        position["cost_basis"] = avg_cost
        positions[existing_idx] = position
    else:
        positions.append(position)

    portfolio["positions"] = positions
    _save_portfolio(portfolio)

    return {"ok": True, "data": {"position": position, "action": "updated" if existing_idx is not None else "added"}}


def remove_position(symbol: str) -> dict[str, Any]:
    """
    Remove a position from the portfolio.

    Args:
        symbol: Stock ticker symbol to remove

    Returns:
        Removed position data
    """
    portfolio = _load_portfolio()
    positions = portfolio.get("positions", [])

    removed = None
    new_positions = []
    for pos in positions:
        if pos.get("symbol", "").upper() == symbol.upper():
            removed = pos
        else:
            new_positions.append(pos)

    if removed is None:
        return {"ok": False, "error": f"Position {symbol} not found"}

    portfolio["positions"] = new_positions
    _save_portfolio(portfolio)

    return {"ok": True, "data": {"removed": removed}}
