#!/usr/bin/env python3
"""
Johny CLI - Learning System Bridge for agent-core

A MathAcademy-inspired learning system with:
- Knowledge graph (topic DAG with prerequisites)
- Mastery tracking (6 levels: Unknown → Fluent)
- Spaced repetition (Ebbinghaus decay modeling)
- FIRe (Fractional Implicit Repetition)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import random
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from johny.knowledge import KnowledgeGraph, Topic
from johny.mastery import MasteryTracker, MasteryLevel
from johny.review import ReviewScheduler
from johny.practice import SessionManager


STATE_DIR = os.path.join(os.path.expanduser("~"), ".zee", "johny")
GRAPH_PATH = os.path.join(STATE_DIR, "knowledge_graph.json")
WIDE_EVENTS_DIR = os.path.join(STATE_DIR, "logs")
WIDE_EVENTS_SAMPLE_RATE = float(os.environ.get("JOHNY_WIDE_EVENTS_SAMPLE_RATE", "0.05"))


def _wide_event_path() -> str:
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return os.path.join(WIDE_EVENTS_DIR, f"johny-wide-{date}.jsonl")


def _ensure_state_dir() -> None:
    os.makedirs(STATE_DIR, exist_ok=True)


def _summarize_data(data: Any) -> Dict[str, Any]:
    if data is None:
        return {}
    if isinstance(data, dict):
        return {"keys": sorted(data.keys()), "count": len(data)}
    if isinstance(data, list):
        return {"count": len(data)}
    return {"type": type(data).__name__}


def _log_wide_event(
    command: str,
    ok: bool,
    data: Any = None,
    error: Optional[str] = None,
) -> None:
    if not ok:
        keep = True
        reason = "error"
    else:
        keep = (WIDE_EVENTS_SAMPLE_RATE > 0) and (random.random() < WIDE_EVENTS_SAMPLE_RATE)
        reason = "sample"
    if not keep:
        return
    try:
        os.makedirs(WIDE_EVENTS_DIR, exist_ok=True)
        event = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "service": "johny-cli",
            "trace_id": str(uuid.uuid4()),
            "command": command,
            "outcome": "ok" if ok else "error",
            "data": _summarize_data(data),
            "error": error,
            "sample": {"kept": keep, "reason": reason, "rate": WIDE_EVENTS_SAMPLE_RATE},
        }
        with open(_wide_event_path(), "a", encoding="utf-8") as handle:
            handle.write(json.dumps(event) + "\n")
    except Exception:
        return


def _load_graph() -> KnowledgeGraph:
    """Load or create the knowledge graph."""
    if os.path.exists(GRAPH_PATH):
        return KnowledgeGraph.load(GRAPH_PATH)
    else:
        graph = KnowledgeGraph.create_default()
        _ensure_state_dir()
        graph.save(GRAPH_PATH)
        return graph


def _json_ok(command: str, data: Any) -> None:
    _log_wide_event(command, True, data=data)
    print(json.dumps({"ok": True, "command": command, "data": data}))


def _json_error(message: str, command: Optional[str] = None) -> int:
    _log_wide_event(command or "error", False, error=message)
    print(json.dumps({"ok": False, "error": message}))
    return 1


# =============================================================================
# Session Commands
# =============================================================================

def cmd_session(args: argparse.Namespace) -> int:
    """Handle session commands."""
    manager = SessionManager()

    if args.action == "start":
        session = manager.start_session(
            domain=args.domain or "math",
            minutes=args.minutes or 30,
        )
        _json_ok("session.start", session.to_dict())
        return 0

    elif args.action == "end":
        session = manager.end_session(args.session_id)
        if session:
            _json_ok("session.end", session.to_dict())
            return 0
        return _json_error("No active session to end")

    elif args.action == "status":
        session = manager.get_active_session()
        if session:
            _json_ok("session.status", session.to_dict())
        else:
            _json_ok("session.status", {"active": False, "message": "No active session"})
        return 0

    elif args.action == "pause":
        session = manager.pause_session()
        if session:
            _json_ok("session.pause", session.to_dict())
            return 0
        return _json_error("No active session to pause")

    elif args.action == "resume":
        session = manager.resume_session()
        if session:
            _json_ok("session.resume", session.to_dict())
            return 0
        return _json_error("No paused session to resume")

    return _json_error(f"Unknown session action: {args.action}")


# =============================================================================
# Knowledge Commands
# =============================================================================

def cmd_knowledge(args: argparse.Namespace) -> int:
    """Handle knowledge graph commands."""
    graph = _load_graph()

    if args.action == "topics":
        if args.domain:
            topics = graph.get_topics_by_domain(args.domain)
        else:
            topics = list(graph.topics.values())

        _json_ok("knowledge.topics", {
            "count": len(topics),
            "topics": [t.to_dict() for t in topics],
        })
        return 0

    elif args.action == "prerequisites":
        if not args.topic:
            return _json_error("--topic required for prerequisites")

        prereqs = graph.get_prerequisites(args.topic)
        all_prereqs = graph.get_all_prerequisites(args.topic)

        _json_ok("knowledge.prerequisites", {
            "topic": args.topic,
            "direct": [p.to_dict() for p in prereqs],
            "all": [p.to_dict() for p in all_prereqs],
        })
        return 0

    elif args.action == "path":
        if not args.target:
            return _json_error("--target required for path")

        tracker = MasteryTracker()
        completed = {
            tid for tid, rec in tracker.records.items()
            if rec.level >= MasteryLevel.PROFICIENT
        }

        try:
            path = graph.get_learning_path(args.target, completed)
            _json_ok("knowledge.path", {
                "target": args.target,
                "topics_to_learn": len(path),
                "path": [t.to_dict() for t in path],
            })
            return 0
        except ValueError as e:
            return _json_error(str(e))

    elif args.action == "add-topic":
        if not args.topic_json:
            return _json_error("--topic-json required for add-topic")

        try:
            topic_data = json.loads(args.topic_json)
            topic = Topic.from_dict(topic_data)
            graph.add_topic(topic)
            graph.save(GRAPH_PATH)
            _json_ok("knowledge.add-topic", topic.to_dict())
            return 0
        except Exception as e:
            return _json_error(f"Failed to add topic: {e}")

    elif args.action == "add-prereq":
        if not args.topic or not args.prereq:
            return _json_error("--topic and --prereq required for add-prereq")

        try:
            graph.add_prerequisite(args.topic, args.prereq)
            graph.save(GRAPH_PATH)
            _json_ok("knowledge.add-prereq", {
                "topic": args.topic,
                "prerequisite": args.prereq,
            })
            return 0
        except ValueError as e:
            return _json_error(str(e))

    elif args.action == "search":
        if not args.query:
            return _json_error("--query required for search")

        results = graph.search_topics(args.query)
        _json_ok("knowledge.search", {
            "query": args.query,
            "count": len(results),
            "results": [t.to_dict() for t in results],
        })
        return 0

    return _json_error(f"Unknown knowledge action: {args.action}")


# =============================================================================
# Mastery Commands
# =============================================================================

def cmd_mastery(args: argparse.Namespace) -> int:
    """Handle mastery commands."""
    tracker = MasteryTracker()

    if args.action == "status":
        if args.topic:
            record = tracker.get_record(args.topic)
            _json_ok("mastery.status", {
                "topic_id": record.topic_id,
                "level": record.level.name.lower(),
                "level_value": record.level.value,
                "retention": round(record.get_retention(), 3),
                "practice_count": record.practice_count,
                "average_score": round(record.average_score, 3),
                "stability": round(record.stability, 2),
                "last_practiced": record.last_practiced,
                "needs_review": record.needs_review(),
            })
        else:
            summary = tracker.get_summary(args.domain)
            _json_ok("mastery.status", summary)
        return 0

    elif args.action == "update":
        if not args.topic:
            return _json_error("--topic required for update")

        if args.level:
            level = MasteryLevel.from_string(args.level)
            record = tracker.get_record(args.topic)
            record.level = level
            tracker.save()
            _json_ok("mastery.update", {
                "topic": args.topic,
                "new_level": level.name.lower(),
            })
            return 0

        if args.score is not None:
            new_level = tracker.record_practice(args.topic, args.score)
            record = tracker.get_record(args.topic)
            _json_ok("mastery.update", {
                "topic": args.topic,
                "score": args.score,
                "new_level": new_level.name.lower(),
                "retention": round(record.get_retention(), 3),
            })
            return 0

        return _json_error("--level or --score required for update")

    elif args.action == "history":
        if not args.topic:
            return _json_error("--topic required for history")

        record = tracker.get_record(args.topic)
        _json_ok("mastery.history", {
            "topic": args.topic,
            "events": [e.to_dict() for e in record.history[-20:]],
        })
        return 0

    elif args.action == "decay":
        if args.topic:
            record = tracker.get_record(args.topic)
            _json_ok("mastery.decay", {
                "topic": args.topic,
                "retention": round(record.get_retention(), 3),
                "stability": round(record.stability, 2),
                "optimal_review": record.get_optimal_review_date(),
            })
        else:
            # Show decay for all topics
            decay_info = []
            for record in tracker.records.values():
                if record.level > MasteryLevel.UNKNOWN:
                    decay_info.append({
                        "topic": record.topic_id,
                        "level": record.level.name.lower(),
                        "retention": round(record.get_retention(), 3),
                        "needs_review": record.needs_review(),
                    })
            decay_info.sort(key=lambda x: x["retention"])
            _json_ok("mastery.decay", {"topics": decay_info})
        return 0

    elif args.action == "summary":
        summary = tracker.get_summary(args.domain)
        _json_ok("mastery.summary", summary)
        return 0

    return _json_error(f"Unknown mastery action: {args.action}")


# =============================================================================
# Review Commands
# =============================================================================

def cmd_review(args: argparse.Namespace) -> int:
    """Handle review commands."""
    tracker = MasteryTracker()
    scheduler = ReviewScheduler(tracker)

    if args.action == "due":
        limit = args.limit or 10
        items = scheduler.get_due_reviews(limit=limit)
        _json_ok("review.due", {
            "count": len(items),
            "items": [item.to_dict() for item in items],
        })
        return 0

    elif args.action == "schedule":
        if not args.topic:
            return _json_error("--topic required for schedule")

        record = tracker.get_record(args.topic)
        optimal = record.get_optimal_review_date()
        _json_ok("review.schedule", {
            "topic": args.topic,
            "current_retention": round(record.get_retention(), 3),
            "optimal_review_date": optimal,
            "stability": round(record.stability, 2),
        })
        return 0

    elif args.action == "complete":
        if not args.topic or args.score is None:
            return _json_error("--topic and --score required for complete")

        graph = _load_graph()
        fire_weights = graph.get_fire_ancestors(args.topic)

        result = scheduler.complete_review(
            args.topic,
            args.score,
            fire_weights=fire_weights,
        )
        result["fire_credit_applied"] = list(fire_weights.keys())
        _json_ok("review.complete", result)
        return 0

    elif args.action == "stats":
        stats = scheduler.get_review_stats()
        _json_ok("review.stats", stats)
        return 0

    elif args.action == "optimize":
        items = scheduler.optimize_schedule(available_minutes=30)
        _json_ok("review.optimize", {
            "suggested_reviews": len(items),
            "items": [item.to_dict() for item in items],
        })
        return 0

    return _json_error(f"Unknown review action: {args.action}")


# =============================================================================
# Practice Commands
# =============================================================================

def cmd_practice(args: argparse.Namespace) -> int:
    """Handle practice commands."""
    graph = _load_graph()
    tracker = MasteryTracker()
    scheduler = ReviewScheduler(tracker)

    if args.action == "next":
        # Get next optimal task: review due items first, then new topics
        due_reviews = scheduler.get_due_reviews(limit=1)

        if due_reviews:
            item = due_reviews[0]
            topic = graph.topics.get(item.topic_id)
            _json_ok("practice.next", {
                "type": "review",
                "topic": topic.to_dict() if topic else {"id": item.topic_id},
                "reason": f"Retention at {item.retention:.0%}, needs review",
                "suggested_difficulty": "adaptive",
            })
            return 0

        # Find next available topic to learn
        completed = {
            tid for tid, rec in tracker.records.items()
            if rec.level >= MasteryLevel.PROFICIENT
        }
        available = graph.get_available_topics(completed)

        if available:
            topic = available[0]
            _json_ok("practice.next", {
                "type": "new_topic",
                "topic": topic.to_dict(),
                "reason": "All prerequisites completed",
                "suggested_difficulty": "easy",
            })
            return 0

        _json_ok("practice.next", {
            "type": "none",
            "message": "No topics available. Consider adding more to the knowledge graph.",
        })
        return 0

    elif args.action == "generate":
        if not args.topic:
            return _json_error("--topic required for generate")

        topic = graph.topics.get(args.topic)
        if not topic:
            return _json_error(f"Topic not found: {args.topic}")

        record = tracker.get_record(args.topic)
        difficulty = args.difficulty or "adaptive"

        # Generate problem metadata (actual problem generation would be more complex)
        _json_ok("practice.generate", {
            "problem_id": f"prob-{args.topic}-{record.practice_count + 1}",
            "topic": topic.to_dict(),
            "type": args.type or "concept",
            "difficulty": difficulty,
            "mastery_level": record.level.name.lower(),
            "concepts": topic.concepts[:3] if topic.concepts else [],
            "hint_available": True,
        })
        return 0

    elif args.action == "complete":
        if not args.problem or args.score is None:
            return _json_error("--problem and --score required for complete")

        # Extract topic from problem ID (format: prob-{topic}-{n})
        # Topic IDs may contain hyphens, so join all parts except first and last
        parts = args.problem.split("-")
        if len(parts) >= 3:
            topic_id = "-".join(parts[1:-1])  # Everything between "prob-" and "-{n}"
        elif len(parts) == 2:
            topic_id = parts[1]
        else:
            return _json_error("Invalid problem ID format")

        fire_weights = graph.get_fire_ancestors(topic_id)
        new_level = tracker.record_practice(topic_id, args.score)

        # Apply FIRe credit
        if args.score >= 0.5:
            tracker.apply_fire_credit(topic_id, fire_weights, args.score)
            tracker.save()  # Save after FIRe credit

        _json_ok("practice.complete", {
            "problem": args.problem,
            "score": args.score,
            "new_level": new_level.name.lower(),
            "fire_credit": list(fire_weights.keys()),
        })
        return 0

    elif args.action == "skip":
        if not args.problem:
            return _json_error("--problem required for skip")

        _json_ok("practice.skip", {
            "problem": args.problem,
            "status": "skipped",
        })
        return 0

    elif args.action == "hint":
        if not args.problem:
            return _json_error("--problem required for hint")

        # Extract topic from problem ID (handles hyphenated topic IDs)
        parts = args.problem.split("-")
        if len(parts) >= 3:
            topic_id = "-".join(parts[1:-1])
        elif len(parts) >= 2:
            topic_id = parts[1]
        else:
            topic_id = "unknown"
        topic = graph.topics.get(topic_id)

        _json_ok("practice.hint", {
            "problem": args.problem,
            "hint": f"Consider the key concepts: {', '.join(topic.concepts[:2]) if topic and topic.concepts else 'review the topic'}",
            "hint_penalty": 0.1,  # Slight score reduction for using hint
        })
        return 0

    return _json_error(f"Unknown practice action: {args.action}")


# =============================================================================
# CLI Parser
# =============================================================================

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Johny Learning System CLI")
    subparsers = parser.add_subparsers(dest="command")

    # Session commands
    session = subparsers.add_parser("session")
    session.add_argument("action", choices=["start", "end", "status", "pause", "resume"])
    session.add_argument("--domain", default="math")
    session.add_argument("--minutes", type=int, default=30)
    session.add_argument("--session-id")

    # Knowledge commands
    knowledge = subparsers.add_parser("knowledge")
    knowledge.add_argument("action", choices=["topics", "prerequisites", "path", "add-topic", "add-prereq", "search"])
    knowledge.add_argument("--domain")
    knowledge.add_argument("--topic")
    knowledge.add_argument("--target")
    knowledge.add_argument("--query")
    knowledge.add_argument("--topic-json")
    knowledge.add_argument("--prereq")

    # Mastery commands
    mastery = subparsers.add_parser("mastery")
    mastery.add_argument("action", choices=["status", "update", "history", "decay", "summary"])
    mastery.add_argument("--topic")
    mastery.add_argument("--domain")
    mastery.add_argument("--level")
    mastery.add_argument("--score", type=float)

    # Review commands
    review = subparsers.add_parser("review")
    review.add_argument("action", choices=["due", "schedule", "complete", "stats", "optimize"])
    review.add_argument("--topic")
    review.add_argument("--domain")
    review.add_argument("--score", type=float)
    review.add_argument("--limit", type=int)

    # Practice commands
    practice = subparsers.add_parser("practice")
    practice.add_argument("action", choices=["next", "generate", "complete", "skip", "hint"])
    practice.add_argument("--topic")
    practice.add_argument("--domain")
    practice.add_argument("--difficulty", choices=["easy", "medium", "hard", "adaptive"])
    practice.add_argument("--problem")
    practice.add_argument("--score", type=float)
    practice.add_argument("--type", choices=["concept", "calculation", "proof", "application"])

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        return _json_error("No command specified. Use: session, knowledge, mastery, review, practice")

    _ensure_state_dir()

    if args.command == "session":
        return cmd_session(args)
    elif args.command == "knowledge":
        return cmd_knowledge(args)
    elif args.command == "mastery":
        return cmd_mastery(args)
    elif args.command == "review":
        return cmd_review(args)
    elif args.command == "practice":
        return cmd_practice(args)

    return _json_error(f"Unknown command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
