"""
Ebbinghaus Forgetting Curve

Models memory retention over time using the exponential decay formula:
R = e^(-t/S)

Where:
- R = retention (0-1)
- t = time since last review (days)
- S = stability (memory strength, increases with successful reviews)
"""

import math
from datetime import datetime, timedelta
from typing import Optional


def calculate_retention(
    days_since_review: float,
    stability: float = 1.0,
) -> float:
    """
    Calculate current retention level.

    Args:
        days_since_review: Days elapsed since last review
        stability: Memory stability factor (higher = slower decay)

    Returns:
        Retention level between 0 and 1
    """
    if stability <= 0:
        return 0.0

    retention = math.exp(-days_since_review / stability)
    return max(0.0, min(1.0, retention))


def optimal_review_interval(
    target_retention: float,
    stability: float,
) -> float:
    """
    Calculate optimal days until review to maintain target retention.

    Solves: target = e^(-t/S) for t
    Result: t = -S * ln(target)

    Args:
        target_retention: Desired retention level (e.g., 0.8)
        stability: Current memory stability

    Returns:
        Days until review should occur
    """
    if target_retention <= 0 or target_retention >= 1:
        raise ValueError("Target retention must be between 0 and 1")

    return -stability * math.log(target_retention)


def update_stability(
    current_stability: float,
    score: float,
    retention_at_review: float,
) -> float:
    """
    Update memory stability based on review performance.

    The stability increases with successful reviews and decreases with failures.
    The increase is larger when retention is lower (harder recall = stronger memory).

    Args:
        current_stability: Current stability value
        score: Practice score (0-1)
        retention_at_review: Retention level when review occurred

    Returns:
        New stability value
    """
    # Base multiplier from score
    if score >= 0.9:
        # Excellent: large stability increase
        base_multiplier = 2.5
    elif score >= 0.7:
        # Good: moderate increase
        base_multiplier = 1.8
    elif score >= 0.5:
        # Okay: small increase
        base_multiplier = 1.3
    elif score >= 0.3:
        # Poor: maintain or slight decrease
        base_multiplier = 0.9
    else:
        # Very poor: decrease
        base_multiplier = 0.6

    # Bonus for low-retention successful recalls (harder = stronger memory)
    if score >= 0.7 and retention_at_review < 0.5:
        difficulty_bonus = 1 + (0.5 - retention_at_review)
        base_multiplier *= difficulty_bonus

    new_stability = current_stability * base_multiplier

    # Clamp to reasonable bounds
    return max(0.5, min(30.0, new_stability))


def days_until_retention_drops_to(
    current_retention: float,
    target_retention: float,
    stability: float,
) -> float:
    """
    Calculate days until retention drops from current to target level.

    Args:
        current_retention: Current retention level
        target_retention: Target (lower) retention level
        stability: Memory stability

    Returns:
        Days until target retention is reached
    """
    if current_retention <= target_retention:
        return 0.0

    # Current: R_c = e^(-t_c/S)
    # Target:  R_t = e^(-t_t/S)
    # We need: t_t - t_c

    t_c = -stability * math.log(current_retention) if current_retention > 0 else 0
    t_t = -stability * math.log(target_retention)

    return max(0.0, t_t - t_c)


def get_review_priority(
    retention: float,
    level_importance: float = 1.0,
    days_overdue: float = 0.0,
) -> float:
    """
    Calculate review priority score.

    Higher score = more urgent review needed.

    Args:
        retention: Current retention level
        level_importance: Weight based on mastery level (higher levels more important)
        days_overdue: Days past optimal review date

    Returns:
        Priority score (higher = more urgent)
    """
    # Base priority from low retention
    retention_urgency = (1 - retention) ** 2

    # Penalty for being overdue
    overdue_penalty = min(1.0, days_overdue / 7)  # Max penalty at 7 days

    # Combine factors
    priority = retention_urgency * level_importance * (1 + overdue_penalty)

    return priority


class ReviewSchedule:
    """
    Optimal review schedule calculator.

    Uses SuperMemo SM-2 inspired algorithm with Ebbinghaus decay.
    """

    # Default target retention levels
    DEFAULT_TARGET = 0.85
    MINIMUM_INTERVAL = 0.5  # Half day minimum
    MAXIMUM_INTERVAL = 180  # 6 months maximum

    def __init__(
        self,
        target_retention: float = DEFAULT_TARGET,
        min_interval: float = MINIMUM_INTERVAL,
        max_interval: float = MAXIMUM_INTERVAL,
    ):
        self.target_retention = target_retention
        self.min_interval = min_interval
        self.max_interval = max_interval

    def next_review_date(
        self,
        last_review: datetime,
        stability: float,
    ) -> datetime:
        """Calculate the next optimal review date."""
        interval = optimal_review_interval(self.target_retention, stability)
        interval = max(self.min_interval, min(self.max_interval, interval))

        return last_review + timedelta(days=interval)

    def should_review_now(
        self,
        last_review: Optional[datetime],
        stability: float,
        threshold: float = 0.7,
    ) -> bool:
        """Check if a topic should be reviewed now."""
        if last_review is None:
            return False

        days_elapsed = (datetime.utcnow() - last_review).total_seconds() / 86400
        retention = calculate_retention(days_elapsed, stability)

        return retention < threshold
