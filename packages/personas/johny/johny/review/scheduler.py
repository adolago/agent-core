"""
Review Scheduler

Manages the spaced repetition schedule across all topics.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from ..mastery.tracker import MasteryTracker, MasteryRecord
from ..mastery.levels import MasteryLevel
from .ebbinghaus import (
    calculate_retention,
    optimal_review_interval,
    get_review_priority,
    ReviewSchedule,
)


@dataclass
class ReviewItem:
    """A topic due for review with priority info."""
    topic_id: str
    retention: float
    priority: float
    days_since_review: float
    optimal_review_date: Optional[str]
    mastery_level: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "topic_id": self.topic_id,
            "retention": round(self.retention, 3),
            "priority": round(self.priority, 3),
            "days_since_review": round(self.days_since_review, 1),
            "optimal_review_date": self.optimal_review_date,
            "mastery_level": self.mastery_level,
        }


class ReviewScheduler:
    """
    Manages spaced repetition reviews.

    Features:
    - Priority-based review queue
    - Optimal scheduling with Ebbinghaus decay
    - FIRe integration for implicit review credit
    """

    def __init__(
        self,
        mastery_tracker: MasteryTracker,
        target_retention: float = 0.85,
    ):
        self.mastery = mastery_tracker
        self.schedule = ReviewSchedule(target_retention=target_retention)

    def get_due_reviews(
        self,
        limit: int = 10,
        threshold: float = 0.7,
    ) -> List[ReviewItem]:
        """
        Get topics due for review, sorted by priority.

        Args:
            limit: Maximum number of items to return
            threshold: Retention threshold below which review is needed

        Returns:
            List of ReviewItems sorted by priority (highest first)
        """
        items = []

        for record in self.mastery.records.values():
            # Skip unknown/unlearned topics
            if record.level == MasteryLevel.UNKNOWN:
                continue

            # Calculate retention
            if record.last_review:
                last_review = datetime.fromisoformat(record.last_review)
                days_elapsed = (datetime.utcnow() - last_review).total_seconds() / 86400
                retention = calculate_retention(days_elapsed, record.stability)
            else:
                days_elapsed = 0
                retention = 0.0

            # Check if needs review
            if retention >= threshold:
                continue

            # Calculate priority
            level_weight = 1 + (record.level.value * 0.2)  # Higher levels more important
            priority = get_review_priority(
                retention=retention,
                level_importance=level_weight,
                days_overdue=max(0, days_elapsed - optimal_review_interval(threshold, record.stability)),
            )

            # Calculate optimal review date
            if record.last_review:
                optimal_date = self.schedule.next_review_date(
                    datetime.fromisoformat(record.last_review),
                    record.stability,
                ).isoformat()
            else:
                optimal_date = None

            items.append(ReviewItem(
                topic_id=record.topic_id,
                retention=retention,
                priority=priority,
                days_since_review=days_elapsed,
                optimal_review_date=optimal_date,
                mastery_level=record.level.name.lower(),
            ))

        # Sort by priority (highest first)
        items.sort(key=lambda x: x.priority, reverse=True)

        return items[:limit]

    def complete_review(
        self,
        topic_id: str,
        score: float,
        fire_weights: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Any]:
        """
        Complete a review and update schedules.

        Args:
            topic_id: Topic being reviewed
            score: Review score (0-1)
            fire_weights: FIRe weights for implicit prerequisite review

        Returns:
            Review result with new scheduling info
        """
        record = self.mastery.get_record(topic_id)

        # Get retention at time of review
        retention_at_review = record.get_retention()

        # Record the practice
        new_level = record.record_practice(score)

        # Apply FIRe credit to prerequisites
        if fire_weights and score >= 0.5:
            self.mastery.apply_fire_credit(topic_id, fire_weights, score)

        # Calculate next review date
        next_review = self.schedule.next_review_date(
            datetime.utcnow(),
            record.stability,
        )

        self.mastery.save()

        return {
            "topic_id": topic_id,
            "score": score,
            "new_level": new_level.name.lower(),
            "retention_at_review": round(retention_at_review, 3),
            "new_stability": round(record.stability, 2),
            "next_review_date": next_review.isoformat(),
            "days_until_review": round(
                (next_review - datetime.utcnow()).total_seconds() / 86400, 1
            ),
        }

    def get_review_stats(self) -> Dict[str, Any]:
        """Get overall review statistics."""
        total_topics = 0
        due_now = 0
        due_today = 0
        due_this_week = 0
        total_reviews_completed = 0
        average_retention = 0.0

        for record in self.mastery.records.values():
            if record.level == MasteryLevel.UNKNOWN:
                continue

            total_topics += 1
            total_reviews_completed += record.practice_count
            retention = record.get_retention()
            average_retention += retention

            if retention < 0.7:
                due_now += 1
            elif retention < 0.85:
                due_today += 1
            elif retention < 0.95:
                due_this_week += 1

        if total_topics > 0:
            average_retention /= total_topics

        return {
            "total_topics": total_topics,
            "due_now": due_now,
            "due_today": due_today,
            "due_this_week": due_this_week,
            "total_reviews_completed": total_reviews_completed,
            "average_retention": round(average_retention, 3),
        }

    def optimize_schedule(
        self,
        available_minutes: int = 30,
        avg_review_minutes: float = 3.0,
    ) -> List[ReviewItem]:
        """
        Suggest optimal review order for available time.

        Prioritizes:
        1. Topics about to be forgotten (low retention)
        2. Higher mastery levels (more investment)
        3. Topics with high FIRe impact (review one, help many)

        Args:
            available_minutes: Time available for review
            avg_review_minutes: Estimated time per review

        Returns:
            Ordered list of topics to review
        """
        max_reviews = int(available_minutes / avg_review_minutes)

        # Get all due reviews with no limit
        all_due = self.get_due_reviews(limit=100, threshold=0.85)

        # Return top items that fit in available time
        return all_due[:max_reviews]
