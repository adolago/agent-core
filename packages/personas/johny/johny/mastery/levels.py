"""
Mastery Level Definitions

Inspired by MathAcademy's mastery system:
- Progressive levels from Unknown to Fluent
- Each level has specific criteria and characteristics
"""

from enum import IntEnum


class MasteryLevel(IntEnum):
    """
    Mastery levels for topic understanding.

    Each level represents a stage in the learning journey:
    0. UNKNOWN - Never encountered the topic
    1. INTRODUCED - Seen but not practiced
    2. DEVELOPING - Actively learning, making progress
    3. PROFICIENT - Can solve with conscious effort
    4. MASTERED - Reliable recall and application
    5. FLUENT - Automatic, effortless mastery
    """
    UNKNOWN = 0
    INTRODUCED = 1
    DEVELOPING = 2
    PROFICIENT = 3
    MASTERED = 4
    FLUENT = 5

    @property
    def name_display(self) -> str:
        """Human-readable name."""
        return self.name.title()

    @property
    def description(self) -> str:
        """Description of what this level means."""
        descriptions = {
            MasteryLevel.UNKNOWN: "Never encountered this topic",
            MasteryLevel.INTRODUCED: "Seen the topic but haven't practiced",
            MasteryLevel.DEVELOPING: "Actively learning, making progress",
            MasteryLevel.PROFICIENT: "Can solve problems with conscious effort",
            MasteryLevel.MASTERED: "Reliable recall and application",
            MasteryLevel.FLUENT: "Automatic, effortless mastery",
        }
        return descriptions.get(self, "")

    @property
    def retention_threshold(self) -> float:
        """Minimum retention to maintain this level (0-1)."""
        thresholds = {
            MasteryLevel.UNKNOWN: 0.0,
            MasteryLevel.INTRODUCED: 0.1,
            MasteryLevel.DEVELOPING: 0.4,
            MasteryLevel.PROFICIENT: 0.6,
            MasteryLevel.MASTERED: 0.8,
            MasteryLevel.FLUENT: 0.95,
        }
        return thresholds.get(self, 0.0)

    @property
    def score_threshold(self) -> float:
        """Minimum practice score to advance to this level."""
        thresholds = {
            MasteryLevel.UNKNOWN: 0.0,
            MasteryLevel.INTRODUCED: 0.0,
            MasteryLevel.DEVELOPING: 0.3,
            MasteryLevel.PROFICIENT: 0.6,
            MasteryLevel.MASTERED: 0.8,
            MasteryLevel.FLUENT: 0.95,
        }
        return thresholds.get(self, 0.0)

    @property
    def review_interval_multiplier(self) -> float:
        """Multiplier for base review interval."""
        multipliers = {
            MasteryLevel.UNKNOWN: 0.0,
            MasteryLevel.INTRODUCED: 0.5,
            MasteryLevel.DEVELOPING: 1.0,
            MasteryLevel.PROFICIENT: 2.0,
            MasteryLevel.MASTERED: 4.0,
            MasteryLevel.FLUENT: 8.0,
        }
        return multipliers.get(self, 1.0)

    @classmethod
    def from_score(cls, score: float, current_level: "MasteryLevel") -> "MasteryLevel":
        """
        Determine new level based on practice score.

        Rules:
        - Score >= 0.95: Advance up to FLUENT
        - Score >= 0.80: Advance up to MASTERED
        - Score >= 0.60: Advance up to PROFICIENT
        - Score >= 0.30: Advance up to DEVELOPING
        - Score < 0.30: May drop a level if below threshold
        """
        if score >= 0.95:
            target = MasteryLevel.FLUENT
        elif score >= 0.80:
            target = MasteryLevel.MASTERED
        elif score >= 0.60:
            target = MasteryLevel.PROFICIENT
        elif score >= 0.30:
            target = MasteryLevel.DEVELOPING
        else:
            # Poor performance - consider dropping
            target = max(MasteryLevel.INTRODUCED, current_level - 1)

        # Can only advance one level at a time
        if target > current_level:
            return MasteryLevel(min(current_level + 1, target))

        # Can drop if score is very low
        if score < 0.3 and current_level > MasteryLevel.INTRODUCED:
            return MasteryLevel(current_level - 1)

        return current_level

    @classmethod
    def from_string(cls, s: str) -> "MasteryLevel":
        """Parse from string."""
        mapping = {
            "unknown": cls.UNKNOWN,
            "introduced": cls.INTRODUCED,
            "developing": cls.DEVELOPING,
            "proficient": cls.PROFICIENT,
            "mastered": cls.MASTERED,
            "fluent": cls.FLUENT,
        }
        return mapping.get(s.lower(), cls.UNKNOWN)
