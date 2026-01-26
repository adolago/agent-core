"""
Paper trading functionality.
"""

import json
import os
from pathlib import Path
from typing import Any


def _get_paper_state_path() -> Path:
    """Get the path to the paper trading state file."""
    return Path.home() / ".zee" / "stanley" / "paper_trading.json"


def _load_paper_state() -> dict[str, Any]:
    """Load paper trading state from disk."""
    path = _get_paper_state_path()
    if path.exists():
        try:
            with open(path) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {"active": False, "strategy": None, "symbols": [], "capital": 0, "positions": [], "trades": []}


def _save_paper_state(state: dict[str, Any]) -> None:
    """Save paper trading state to disk."""
    from datetime import datetime

    path = _get_paper_state_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    state["updated_at"] = datetime.now().isoformat()

    with open(path, "w") as f:
        json.dump(state, f, indent=2)


def start_paper_trading(strategy: str, symbols: list[str], capital: float = 100000) -> dict[str, Any]:
    """
    Start paper trading simulation.

    Args:
        strategy: Strategy to use
        symbols: Symbols to trade
        capital: Starting capital

    Returns:
        Paper trading session info
    """
    from datetime import datetime
    from stanley.nautilus.backtest import BUILTIN_STRATEGIES

    # Validate strategy
    if strategy.lower() not in BUILTIN_STRATEGIES:
        return {
            "ok": False,
            "error": f"Unknown strategy: {strategy}. Available: {', '.join(BUILTIN_STRATEGIES.keys())}",
        }

    state = _load_paper_state()

    if state.get("active"):
        return {
            "ok": False,
            "error": "Paper trading already active. Stop current session first.",
        }

    state = {
        "active": True,
        "strategy": strategy.lower(),
        "strategy_name": BUILTIN_STRATEGIES[strategy.lower()]["name"],
        "symbols": [s.upper() for s in symbols],
        "capital": capital,
        "starting_capital": capital,
        "positions": [],
        "trades": [],
        "started_at": datetime.now().isoformat(),
    }

    _save_paper_state(state)

    return {
        "ok": True,
        "data": {
            "message": "Paper trading started",
            "strategy": state["strategy_name"],
            "symbols": state["symbols"],
            "capital": capital,
            "note": "Paper trading runs on-demand. Use 'paper_status' to check and update positions.",
        },
    }


def stop_paper_trading() -> dict[str, Any]:
    """
    Stop paper trading simulation.

    Returns:
        Final paper trading results
    """
    state = _load_paper_state()

    if not state.get("active"):
        return {"ok": False, "error": "No active paper trading session"}

    # Calculate final results
    starting_capital = state.get("starting_capital", 100000)
    current_capital = state.get("capital", starting_capital)
    total_return = ((current_capital - starting_capital) / starting_capital) * 100

    trades = state.get("trades", [])
    winning_trades = sum(1 for t in trades if t.get("pnl", 0) > 0)
    win_rate = (winning_trades / len(trades) * 100) if trades else 0

    results = {
        "strategy": state.get("strategy_name"),
        "symbols": state.get("symbols"),
        "starting_capital": starting_capital,
        "final_capital": current_capital,
        "total_return_percent": round(total_return, 2),
        "total_trades": len(trades),
        "win_rate_percent": round(win_rate, 2),
        "started_at": state.get("started_at"),
        "stopped_at": state.get("updated_at"),
    }

    # Clear state
    _save_paper_state(
        {
            "active": False,
            "strategy": None,
            "symbols": [],
            "capital": 0,
            "positions": [],
            "trades": [],
            "last_session": results,
        }
    )

    return {"ok": True, "data": results}


def get_paper_status() -> dict[str, Any]:
    """
    Get current paper trading status.

    Returns:
        Current paper trading state including positions and P&L
    """
    state = _load_paper_state()

    if not state.get("active"):
        last_session = state.get("last_session")
        return {
            "ok": True,
            "data": {
                "active": False,
                "message": "No active paper trading session",
                "last_session": last_session,
            },
        }

    # Update positions with current prices
    try:
        from stanley.market.quotes import get_quote

        positions = state.get("positions", [])
        updated_positions = []
        total_value = state.get("capital", 0)

        for pos in positions:
            quote = get_quote(pos["symbol"])
            if quote.get("ok"):
                current_price = quote.get("data", {}).get("price", pos.get("entry_price", 0))
                market_value = current_price * pos.get("shares", 0)
                entry_value = pos.get("entry_price", 0) * pos.get("shares", 0)
                pnl = market_value - entry_value

                updated_positions.append(
                    {
                        **pos,
                        "current_price": current_price,
                        "market_value": market_value,
                        "unrealized_pnl": pnl,
                        "pnl_percent": (pnl / entry_value * 100) if entry_value > 0 else 0,
                    }
                )
                total_value += market_value
            else:
                updated_positions.append(pos)

        state["positions"] = updated_positions
    except Exception:
        pass

    starting_capital = state.get("starting_capital", 100000)
    current_capital = state.get("capital", starting_capital)
    position_value = sum(p.get("market_value", 0) for p in state.get("positions", []))
    total_value = current_capital + position_value

    return {
        "ok": True,
        "data": {
            "active": True,
            "strategy": state.get("strategy_name"),
            "symbols": state.get("symbols"),
            "starting_capital": starting_capital,
            "cash": current_capital,
            "position_value": position_value,
            "total_value": total_value,
            "total_return_percent": round((total_value - starting_capital) / starting_capital * 100, 2),
            "positions": state.get("positions", []),
            "trade_count": len(state.get("trades", [])),
            "started_at": state.get("started_at"),
        },
    }
