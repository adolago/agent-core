"""
Mastery Tracker

Tracks mastery levels for topics over time, including:
- Current mastery level
- Practice history
- Retention decay
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from .levels import MasteryLevel


@dataclass
class PracticeEvent:
    """A single practice event."""
    timestamp: str
    score: float
    level_before: int
    level_after: int
    problem_type: str = ""
    time_spent_seconds: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "score": self.score,
            "level_before": self.level_before,
            "level_after": self.level_after,
            "problem_type": self.problem_type,
            "time_spent_seconds": self.time_spent_seconds,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PracticeEvent:
        return cls(
            timestamp=data["timestamp"],
            score=data["score"],
            level_before=data["level_before"],
            level_after=data["level_after"],
            problem_type=data.get("problem_type", ""),
            time_spent_seconds=data.get("time_spent_seconds", 0),
        )


@dataclass
class MasteryRecord:
    """Mastery record for a single topic."""
    topic_id: str
    level: MasteryLevel = MasteryLevel.UNKNOWN
    last_practiced: Optional[str] = None
    practice_count: int = 0
    total_time_seconds: int = 0
    average_score: float = 0.0
    history: List[PracticeEvent] = field(default_factory=list)

    # Ebbinghaus decay parameters
    stability: float = 1.0  # How stable the memory is (increases with repetition)
    last_review: Optional[str] = None

    def record_practice(
        self,
        score: float,
        problem_type: str = "",
        time_spent_seconds: int = 0,
    ) -> MasteryLevel:
        """
        Record a practice event and update mastery level.

        Returns the new mastery level.
        """
        now = datetime.utcnow().isoformat()
        level_before = self.level

        # Update level based on score
        new_level = MasteryLevel.from_score(score, self.level)
        self.level = new_level

        # Update statistics
        self.practice_count += 1
        self.total_time_seconds += time_spent_seconds
        self.last_practiced = now
        self.last_review = now

        # Update running average
        self.average_score = (
            (self.average_score * (self.practice_count - 1) + score)
            / self.practice_count
        )

        # Increase stability with successful practice
        if score >= 0.7:
            self.stability = min(10.0, self.stability * 1.2)
        elif score < 0.4:
            self.stability = max(0.5, self.stability * 0.8)

        # Record event
        event = PracticeEvent(
            timestamp=now,
            score=score,
            level_before=level_before,
            level_after=new_level,
            problem_type=problem_type,
            time_spent_seconds=time_spent_seconds,
        )
        self.history.append(event)
        if len(self.history) > 50:
            self.history = self.history[-50:]

        return new_level

    def get_retention(self) -> float:
        """
        Calculate current retention using Ebbinghaus decay model.

        R = e^(-t/S) where:
        - R is retention (0-1)
        - t is time since last review (in days)
        - S is stability (higher = slower decay)
        """
        import math

        if not self.last_review:
            return 0.0

        last_review_dt = datetime.fromisoformat(self.last_review)
        days_elapsed = (datetime.utcnow() - last_review_dt).total_seconds() / 86400

        retention = math.exp(-days_elapsed / self.stability)
        return max(0.0, min(1.0, retention))

    def needs_review(self, threshold: float = 0.7) -> bool:
        """Check if topic needs review (retention below threshold)."""
        if self.level == MasteryLevel.UNKNOWN:
            return False
        return self.get_retention() < threshold

    def get_optimal_review_date(self, target_retention: float = 0.7) -> Optional[str]:
        """Calculate when review should happen to maintain target retention."""
        import math

        if not self.last_review or self.level == MasteryLevel.UNKNOWN:
            return None

        # Solve for t: target_retention = e^(-t/S)
        # t = -S * ln(target_retention)
        days_until_review = -self.stability * math.log(target_retention)

        last_review_dt = datetime.fromisoformat(self.last_review)
        review_date = last_review_dt.replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        from datetime import timedelta
        review_date += timedelta(days=days_until_review)

        return review_date.isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "topic_id": self.topic_id,
            "level": self.level.value,
            "last_practiced": self.last_practiced,
            "practice_count": self.practice_count,
            "total_time_seconds": self.total_time_seconds,
            "average_score": self.average_score,
            "stability": self.stability,
            "last_review": self.last_review,
            "history": [e.to_dict() for e in self.history],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> MasteryRecord:
        return cls(
            topic_id=data["topic_id"],
            level=MasteryLevel(data.get("level", 0)),
            last_practiced=data.get("last_practiced"),
            practice_count=data.get("practice_count", 0),
            total_time_seconds=data.get("total_time_seconds", 0),
            average_score=data.get("average_score", 0.0),
            stability=data.get("stability", 1.0),
            last_review=data.get("last_review"),
            history=[PracticeEvent.from_dict(e) for e in data.get("history", [])],
        )


class MasteryTracker:
    """
    Tracks mastery across all topics.
    """

    def __init__(self, state_path: Optional[str] = None):
        self.records: Dict[str, MasteryRecord] = {}
        self.state_path = state_path or os.path.join(
            os.path.expanduser("~"), ".zee", "johny", "mastery.json"
        )
        self._load()

    def _load(self) -> None:
        """Load state from disk."""
        if os.path.exists(self.state_path):
            try:
                with open(self.state_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                for record_data in data.get("records", []):
                    record = MasteryRecord.from_dict(record_data)
                    self.records[record.topic_id] = record
            except Exception:
                pass

    def save(self) -> None:
        """Save state to disk."""
        os.makedirs(os.path.dirname(self.state_path), exist_ok=True)
        with open(self.state_path, "w", encoding="utf-8") as f:
            json.dump(
                {"records": [r.to_dict() for r in self.records.values()]},
                f,
                indent=2,
            )

    def get_record(self, topic_id: str) -> MasteryRecord:
        """Get or create mastery record for a topic."""
        if topic_id not in self.records:
            self.records[topic_id] = MasteryRecord(topic_id=topic_id)
        return self.records[topic_id]

    def record_practice(
        self,
        topic_id: str,
        score: float,
        problem_type: str = "",
        time_spent_seconds: int = 0,
    ) -> MasteryLevel:
        """Record practice and update mastery."""
        record = self.get_record(topic_id)
        new_level = record.record_practice(score, problem_type, time_spent_seconds)
        self.save()
        return new_level

    def get_level(self, topic_id: str) -> MasteryLevel:
        """Get current mastery level for a topic."""
        return self.get_record(topic_id).level

    def get_retention(self, topic_id: str) -> float:
        """Get current retention for a topic."""
        return self.get_record(topic_id).get_retention()

    def get_topics_due_for_review(
        self,
        threshold: float = 0.7,
        domain: Optional[str] = None,
    ) -> List[MasteryRecord]:
        """Get topics that need review."""
        due = []
        for record in self.records.values():
            if record.needs_review(threshold):
                due.append(record)

        # Sort by retention (lowest first = most urgent)
        return sorted(due, key=lambda r: r.get_retention())

    def get_summary(self, domain: Optional[str] = None) -> Dict[str, Any]:
        """Get mastery summary statistics."""
        records = list(self.records.values())

        if not records:
            return {
                "total_topics": 0,
                "by_level": {},
                "average_retention": 0.0,
                "topics_needing_review": 0,
            }

        by_level = {level.name.lower(): 0 for level in MasteryLevel}
        total_retention = 0.0
        needing_review = 0

        for record in records:
            by_level[record.level.name.lower()] += 1
            retention = record.get_retention()
            total_retention += retention
            if record.needs_review():
                needing_review += 1

        return {
            "total_topics": len(records),
            "by_level": by_level,
            "average_retention": total_retention / len(records),
            "topics_needing_review": needing_review,
        }

    def apply_fire_credit(
        self,
        topic_id: str,
        fire_weights: Dict[str, float],
        base_score: float,
    ) -> None:
        """
        Apply FIRe (Fractional Implicit Repetition) credit to prerequisites.

        When practicing a topic, prerequisites get partial review credit.
        """
        for prereq_id, weight in fire_weights.items():
            adjusted_score = base_score * weight
            # Only apply if score is meaningful
            if adjusted_score >= 0.3:
                record = self.get_record(prereq_id)
                # Implicit review - update retention but don't change level
                if record.last_review:
                    record.stability = min(10.0, record.stability * (1 + 0.1 * weight))
                    record.last_review = datetime.utcnow().isoformat()

        self.save()
