"""
Study Session Management

Manages focused practice sessions with:
- Time tracking
- Task scheduling
- Progress recording
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4


class SessionStatus(Enum):
    """Session lifecycle status."""
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


@dataclass
class PracticeTask:
    """A single practice task within a session."""
    task_id: str
    topic_id: str
    problem_type: str
    difficulty: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    score: Optional[float] = None
    skipped: bool = False
    hint_used: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "topic_id": self.topic_id,
            "problem_type": self.problem_type,
            "difficulty": self.difficulty,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "score": self.score,
            "skipped": self.skipped,
            "hint_used": self.hint_used,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PracticeTask:
        return cls(
            task_id=data["task_id"],
            topic_id=data["topic_id"],
            problem_type=data.get("problem_type", "concept"),
            difficulty=data.get("difficulty", "medium"),
            started_at=data.get("started_at"),
            completed_at=data.get("completed_at"),
            score=data.get("score"),
            skipped=data.get("skipped", False),
            hint_used=data.get("hint_used", False),
        )


@dataclass
class StudySession:
    """A focused study session."""
    session_id: str
    domain: str
    status: SessionStatus = SessionStatus.ACTIVE
    planned_minutes: int = 30
    started_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    ended_at: Optional[str] = None
    paused_at: Optional[str] = None
    total_paused_seconds: int = 0

    tasks: List[PracticeTask] = field(default_factory=list)
    current_task_index: int = 0

    # Statistics
    tasks_completed: int = 0
    tasks_skipped: int = 0
    total_score: float = 0.0

    def get_elapsed_minutes(self) -> float:
        """Get active session time in minutes."""
        start = datetime.fromisoformat(self.started_at)

        if self.ended_at:
            end = datetime.fromisoformat(self.ended_at)
        elif self.paused_at:
            end = datetime.fromisoformat(self.paused_at)
        else:
            end = datetime.utcnow()

        total_seconds = (end - start).total_seconds() - self.total_paused_seconds
        return max(0, total_seconds / 60)

    def get_remaining_minutes(self) -> float:
        """Get remaining planned time."""
        return max(0, self.planned_minutes - self.get_elapsed_minutes())

    def is_time_up(self) -> bool:
        """Check if planned time has elapsed."""
        return self.get_elapsed_minutes() >= self.planned_minutes

    def pause(self) -> None:
        """Pause the session."""
        if self.status == SessionStatus.ACTIVE:
            self.status = SessionStatus.PAUSED
            self.paused_at = datetime.utcnow().isoformat()

    def resume(self) -> None:
        """Resume a paused session."""
        if self.status == SessionStatus.PAUSED and self.paused_at:
            paused_duration = (
                datetime.utcnow() - datetime.fromisoformat(self.paused_at)
            ).total_seconds()
            self.total_paused_seconds += int(paused_duration)
            self.paused_at = None
            self.status = SessionStatus.ACTIVE

    def end(self, status: SessionStatus = SessionStatus.COMPLETED) -> None:
        """End the session."""
        self.status = status
        self.ended_at = datetime.utcnow().isoformat()

    def add_task(self, topic_id: str, problem_type: str, difficulty: str) -> PracticeTask:
        """Add a new task to the session."""
        task = PracticeTask(
            task_id=f"task-{uuid4().hex[:8]}",
            topic_id=topic_id,
            problem_type=problem_type,
            difficulty=difficulty,
        )
        self.tasks.append(task)
        return task

    def start_task(self, task_id: str) -> Optional[PracticeTask]:
        """Mark a task as started."""
        for task in self.tasks:
            if task.task_id == task_id:
                task.started_at = datetime.utcnow().isoformat()
                return task
        return None

    def complete_task(self, task_id: str, score: float) -> Optional[PracticeTask]:
        """Complete a task with a score."""
        for task in self.tasks:
            if task.task_id == task_id:
                task.completed_at = datetime.utcnow().isoformat()
                task.score = score
                self.tasks_completed += 1
                self.total_score += score
                return task
        return None

    def skip_task(self, task_id: str) -> Optional[PracticeTask]:
        """Skip a task."""
        for task in self.tasks:
            if task.task_id == task_id:
                task.skipped = True
                self.tasks_skipped += 1
                return task
        return None

    def get_average_score(self) -> float:
        """Get average score for completed tasks."""
        if self.tasks_completed == 0:
            return 0.0
        return self.total_score / self.tasks_completed

    def to_dict(self) -> Dict[str, Any]:
        return {
            "session_id": self.session_id,
            "domain": self.domain,
            "status": self.status.value,
            "planned_minutes": self.planned_minutes,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "paused_at": self.paused_at,
            "total_paused_seconds": self.total_paused_seconds,
            "tasks": [t.to_dict() for t in self.tasks],
            "current_task_index": self.current_task_index,
            "tasks_completed": self.tasks_completed,
            "tasks_skipped": self.tasks_skipped,
            "total_score": self.total_score,
            "elapsed_minutes": round(self.get_elapsed_minutes(), 1),
            "remaining_minutes": round(self.get_remaining_minutes(), 1),
            "average_score": round(self.get_average_score(), 3),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> StudySession:
        return cls(
            session_id=data["session_id"],
            domain=data["domain"],
            status=SessionStatus(data.get("status", "active")),
            planned_minutes=data.get("planned_minutes", 30),
            started_at=data["started_at"],
            ended_at=data.get("ended_at"),
            paused_at=data.get("paused_at"),
            total_paused_seconds=data.get("total_paused_seconds", 0),
            tasks=[PracticeTask.from_dict(t) for t in data.get("tasks", [])],
            current_task_index=data.get("current_task_index", 0),
            tasks_completed=data.get("tasks_completed", 0),
            tasks_skipped=data.get("tasks_skipped", 0),
            total_score=data.get("total_score", 0.0),
        )


class SessionManager:
    """Manages study sessions."""

    def __init__(self, state_dir: Optional[str] = None):
        self.state_dir = state_dir or os.path.join(
            os.path.expanduser("~"), ".zee", "johny", "sessions"
        )
        os.makedirs(self.state_dir, exist_ok=True)
        self._active_session: Optional[StudySession] = None
        self._load_active_session()

    def _session_path(self, session_id: str) -> str:
        return os.path.join(self.state_dir, f"{session_id}.json")

    def _active_session_path(self) -> str:
        return os.path.join(self.state_dir, "active.json")

    def _load_active_session(self) -> None:
        """Load any active session from disk."""
        active_path = self._active_session_path()
        if os.path.exists(active_path):
            try:
                with open(active_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                session = StudySession.from_dict(data)
                if session.status == SessionStatus.ACTIVE:
                    self._active_session = session
            except Exception:
                pass

    def _save_session(self, session: StudySession) -> None:
        """Save session to disk."""
        path = self._session_path(session.session_id)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(session.to_dict(), f, indent=2)

        # Update active session pointer
        if session.status == SessionStatus.ACTIVE:
            with open(self._active_session_path(), "w", encoding="utf-8") as f:
                json.dump(session.to_dict(), f, indent=2)
        elif os.path.exists(self._active_session_path()):
            os.remove(self._active_session_path())

    def start_session(
        self,
        domain: str = "math",
        minutes: int = 30,
    ) -> StudySession:
        """Start a new study session."""
        # End any existing active session
        if self._active_session:
            self._active_session.end(SessionStatus.ABANDONED)
            self._save_session(self._active_session)

        session = StudySession(
            session_id=f"session-{uuid4().hex[:8]}",
            domain=domain,
            planned_minutes=minutes,
        )
        self._active_session = session
        self._save_session(session)
        return session

    def get_active_session(self) -> Optional[StudySession]:
        """Get the currently active session."""
        return self._active_session

    def end_session(self, session_id: Optional[str] = None) -> Optional[StudySession]:
        """End a session."""
        session = self._active_session
        if session and (session_id is None or session.session_id == session_id):
            session.end()
            self._save_session(session)
            self._active_session = None
            return session
        return None

    def pause_session(self) -> Optional[StudySession]:
        """Pause the active session."""
        if self._active_session:
            self._active_session.pause()
            self._save_session(self._active_session)
            return self._active_session
        return None

    def resume_session(self) -> Optional[StudySession]:
        """Resume the active session."""
        if self._active_session:
            self._active_session.resume()
            self._save_session(self._active_session)
            return self._active_session
        return None

    def get_session_history(self, limit: int = 10) -> List[StudySession]:
        """Get recent session history."""
        sessions = []
        for filename in sorted(os.listdir(self.state_dir), reverse=True):
            if filename.endswith(".json") and filename != "active.json":
                try:
                    path = os.path.join(self.state_dir, filename)
                    with open(path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    sessions.append(StudySession.from_dict(data))
                except Exception:
                    pass

                if len(sessions) >= limit:
                    break

        return sessions
