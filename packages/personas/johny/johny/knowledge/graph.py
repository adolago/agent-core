"""
Knowledge Graph - Topic DAG with prerequisites.

The knowledge graph is a Directed Acyclic Graph (DAG) where:
- Nodes are topics
- Edges represent "is prerequisite for" relationships
- Learning paths follow topological order
"""

from __future__ import annotations

import json
import os
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

from .topics import (
    Topic,
    TopicStatus,
    MATH_TOPICS,
    MATH_PREREQUISITES,
    CS_TOPICS,
    CS_PREREQUISITES,
)


@dataclass
class KnowledgeGraph:
    """
    A DAG of topics with prerequisite relationships.

    Supports:
    - Topic lookup and filtering
    - Prerequisite queries
    - Learning path generation
    - Topological ordering
    """
    topics: Dict[str, Topic] = field(default_factory=dict)
    prerequisites: Dict[str, Set[str]] = field(default_factory=lambda: defaultdict(set))
    dependents: Dict[str, Set[str]] = field(default_factory=lambda: defaultdict(set))

    def add_topic(self, topic: Topic) -> None:
        """Add a topic to the graph."""
        self.topics[topic.id] = topic

    def add_prerequisite(self, topic_id: str, prereq_id: str) -> None:
        """Add a prerequisite relationship: prereq_id is required before topic_id."""
        if topic_id not in self.topics:
            raise ValueError(f"Topic not found: {topic_id}")
        if prereq_id not in self.topics:
            raise ValueError(f"Prerequisite topic not found: {prereq_id}")

        # Check for cycles
        if self._would_create_cycle(topic_id, prereq_id):
            raise ValueError(f"Adding prerequisite would create cycle: {prereq_id} -> {topic_id}")

        self.prerequisites[topic_id].add(prereq_id)
        self.dependents[prereq_id].add(topic_id)

    def _would_create_cycle(self, topic_id: str, prereq_id: str) -> bool:
        """Check if adding prereq_id as prerequisite of topic_id would create a cycle."""
        # If topic_id is reachable from prereq_id, adding the edge would create a cycle
        visited = set()
        queue = deque([topic_id])

        while queue:
            current = queue.popleft()
            if current == prereq_id:
                return True
            if current in visited:
                continue
            visited.add(current)
            # Follow dependents (topics that depend on current)
            queue.extend(self.dependents.get(current, set()))

        return False

    def get_prerequisites(self, topic_id: str) -> List[Topic]:
        """Get direct prerequisites for a topic."""
        prereq_ids = self.prerequisites.get(topic_id, set())
        return [self.topics[pid] for pid in prereq_ids if pid in self.topics]

    def get_all_prerequisites(self, topic_id: str) -> List[Topic]:
        """Get all prerequisites (transitive closure) for a topic."""
        all_prereqs: Set[str] = set()
        queue = deque(self.prerequisites.get(topic_id, set()))

        while queue:
            prereq_id = queue.popleft()
            if prereq_id in all_prereqs:
                continue
            all_prereqs.add(prereq_id)
            queue.extend(self.prerequisites.get(prereq_id, set()))

        return [self.topics[pid] for pid in all_prereqs if pid in self.topics]

    def get_dependents(self, topic_id: str) -> List[Topic]:
        """Get topics that depend on this topic."""
        dependent_ids = self.dependents.get(topic_id, set())
        return [self.topics[did] for did in dependent_ids if did in self.topics]

    def get_learning_path(
        self,
        target_id: str,
        completed_ids: Optional[Set[str]] = None,
    ) -> List[Topic]:
        """
        Get the optimal learning path to reach a target topic.

        Returns topics in topological order, excluding already completed topics.
        """
        if target_id not in self.topics:
            raise ValueError(f"Topic not found: {target_id}")

        completed = completed_ids or set()

        # Get all prerequisites needed
        needed = self.get_all_prerequisites(target_id)
        needed_ids = {t.id for t in needed}
        needed_ids.add(target_id)

        # Filter out completed topics
        to_learn = needed_ids - completed

        # Topological sort
        return self._topological_sort(to_learn)

    def _topological_sort(self, topic_ids: Set[str]) -> List[Topic]:
        """Topological sort of a subset of topics."""
        # Build in-degree map for the subset
        in_degree: Dict[str, int] = {tid: 0 for tid in topic_ids}

        for tid in topic_ids:
            for prereq_id in self.prerequisites.get(tid, set()):
                if prereq_id in topic_ids:
                    in_degree[tid] += 1

        # Start with topics that have no prerequisites in the subset
        queue = deque([tid for tid, deg in in_degree.items() if deg == 0])
        result = []

        while queue:
            current = queue.popleft()
            result.append(self.topics[current])

            for dependent_id in self.dependents.get(current, set()):
                if dependent_id in in_degree:
                    in_degree[dependent_id] -= 1
                    if in_degree[dependent_id] == 0:
                        queue.append(dependent_id)

        return result

    def get_available_topics(self, completed_ids: Set[str]) -> List[Topic]:
        """Get topics that are available to learn (all prerequisites completed)."""
        available = []

        for topic_id, topic in self.topics.items():
            if topic_id in completed_ids:
                continue

            prereqs = self.prerequisites.get(topic_id, set())
            if prereqs.issubset(completed_ids):
                available.append(topic)

        # Sort by difficulty
        return sorted(available, key=lambda t: t.difficulty)

    def get_topics_by_domain(self, domain: str) -> List[Topic]:
        """Get all topics in a domain."""
        return [t for t in self.topics.values() if t.domain == domain]

    def search_topics(self, query: str) -> List[Topic]:
        """Search topics by name or description."""
        query_lower = query.lower()
        results = []

        for topic in self.topics.values():
            if (
                query_lower in topic.name.lower()
                or query_lower in topic.description.lower()
                or any(query_lower in tag.lower() for tag in topic.tags)
            ):
                results.append(topic)

        return results

    def get_fire_ancestors(self, topic_id: str, max_depth: int = 4) -> Dict[str, float]:
        """
        Get FIRe (Fractional Implicit Repetition) weights for ancestors.

        When practicing a topic, you implicitly review its prerequisites.
        The weight decreases by 50% for each level of depth.

        Example for "Integration by Parts":
        - Integration (parent): 0.5
        - Derivatives (grandparent): 0.25
        - Limits (great-grandparent): 0.125

        Returns: Dict[topic_id, weight]
        """
        weights: Dict[str, float] = {}
        current_weight = 0.5  # Start at 50% for direct prerequisites

        current_level = self.prerequisites.get(topic_id, set())

        for depth in range(max_depth):
            if not current_level:
                break

            for prereq_id in current_level:
                if prereq_id not in weights:
                    weights[prereq_id] = current_weight

            # Move to next level
            next_level: Set[str] = set()
            for prereq_id in current_level:
                next_level.update(self.prerequisites.get(prereq_id, set()))

            current_level = next_level
            current_weight *= 0.5

        return weights

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "topics": {tid: t.to_dict() for tid, t in self.topics.items()},
            "prerequisites": {tid: list(prereqs) for tid, prereqs in self.prerequisites.items()},
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> KnowledgeGraph:
        """Deserialize from dictionary."""
        graph = cls()

        # Add topics
        for tid, topic_data in data.get("topics", {}).items():
            graph.add_topic(Topic.from_dict(topic_data))

        # Add prerequisites
        for tid, prereqs in data.get("prerequisites", {}).items():
            for prereq_id in prereqs:
                try:
                    graph.add_prerequisite(tid, prereq_id)
                except ValueError:
                    pass  # Skip invalid relationships

        return graph

    def save(self, path: str) -> None:
        """Save graph to JSON file."""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, path: str) -> KnowledgeGraph:
        """Load graph from JSON file."""
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return cls.from_dict(data)

    @classmethod
    def create_default(cls) -> KnowledgeGraph:
        """Create a graph with default math and CS topics."""
        graph = cls()

        # Add math topics
        for topic in MATH_TOPICS:
            graph.add_topic(topic)

        for tid, prereqs in MATH_PREREQUISITES.items():
            for prereq_id in prereqs:
                graph.add_prerequisite(tid, prereq_id)

        # Add CS topics
        for topic in CS_TOPICS:
            graph.add_topic(topic)

        for tid, prereqs in CS_PREREQUISITES.items():
            for prereq_id in prereqs:
                graph.add_prerequisite(tid, prereq_id)

        return graph
