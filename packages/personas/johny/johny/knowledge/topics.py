"""Topic definitions and data structures."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class TopicStatus(Enum):
    """Topic learning status."""
    LOCKED = "locked"        # Prerequisites not met
    AVAILABLE = "available"  # Ready to learn
    IN_PROGRESS = "in_progress"  # Currently learning
    COMPLETED = "completed"  # Mastered


@dataclass
class Topic:
    """
    A topic in the knowledge graph.

    Topics are nodes in a DAG where edges represent prerequisite relationships.
    """
    id: str
    name: str
    domain: str
    description: str = ""
    difficulty: float = 0.5  # 0-1 scale
    estimated_hours: float = 1.0
    tags: List[str] = field(default_factory=list)

    # Content
    concepts: List[str] = field(default_factory=list)
    skills: List[str] = field(default_factory=list)

    # Metadata
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "id": self.id,
            "name": self.name,
            "domain": self.domain,
            "description": self.description,
            "difficulty": self.difficulty,
            "estimated_hours": self.estimated_hours,
            "tags": self.tags,
            "concepts": self.concepts,
            "skills": self.skills,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> Topic:
        """Create from dictionary."""
        return cls(
            id=data["id"],
            name=data["name"],
            domain=data["domain"],
            description=data.get("description", ""),
            difficulty=data.get("difficulty", 0.5),
            estimated_hours=data.get("estimated_hours", 1.0),
            tags=data.get("tags", []),
            concepts=data.get("concepts", []),
            skills=data.get("skills", []),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at"),
        )


# Pre-defined math topics for bootstrapping
MATH_TOPICS = [
    # Foundations
    Topic(
        id="arithmetic",
        name="Arithmetic",
        domain="math",
        description="Basic operations: addition, subtraction, multiplication, division",
        difficulty=0.1,
        estimated_hours=2.0,
        concepts=["addition", "subtraction", "multiplication", "division", "order of operations"],
        skills=["mental math", "estimation"],
    ),
    Topic(
        id="fractions",
        name="Fractions",
        domain="math",
        description="Fraction operations and concepts",
        difficulty=0.2,
        estimated_hours=3.0,
        concepts=["numerator", "denominator", "equivalent fractions", "mixed numbers"],
        skills=["fraction arithmetic", "simplification"],
    ),
    Topic(
        id="algebra-basics",
        name="Algebra Basics",
        domain="math",
        description="Variables, expressions, and simple equations",
        difficulty=0.25,
        estimated_hours=4.0,
        concepts=["variables", "expressions", "equations", "solving for x"],
        skills=["equation solving", "expression simplification"],
    ),
    Topic(
        id="linear-equations",
        name="Linear Equations",
        domain="math",
        description="Single-variable and multi-variable linear equations",
        difficulty=0.3,
        estimated_hours=3.0,
        concepts=["slope", "y-intercept", "graphing", "systems of equations"],
        skills=["graphing lines", "solving systems"],
    ),
    Topic(
        id="quadratics",
        name="Quadratic Equations",
        domain="math",
        description="Quadratic equations and functions",
        difficulty=0.4,
        estimated_hours=4.0,
        concepts=["parabola", "vertex", "roots", "discriminant", "factoring"],
        skills=["factoring", "quadratic formula", "completing the square"],
    ),
    Topic(
        id="functions",
        name="Functions",
        domain="math",
        description="Function concepts, notation, and operations",
        difficulty=0.35,
        estimated_hours=4.0,
        concepts=["domain", "range", "composition", "inverse", "transformations"],
        skills=["function evaluation", "graphing", "finding inverses"],
    ),
    Topic(
        id="trigonometry",
        name="Trigonometry",
        domain="math",
        description="Trigonometric functions and identities",
        difficulty=0.45,
        estimated_hours=6.0,
        concepts=["sine", "cosine", "tangent", "unit circle", "identities"],
        skills=["evaluating trig functions", "proving identities", "solving trig equations"],
    ),
    # Calculus
    Topic(
        id="limits",
        name="Limits",
        domain="math",
        description="Concept of limits and continuity",
        difficulty=0.5,
        estimated_hours=4.0,
        concepts=["limit definition", "one-sided limits", "continuity", "L'Hopital's rule"],
        skills=["evaluating limits", "epsilon-delta proofs"],
    ),
    Topic(
        id="derivatives",
        name="Derivatives",
        domain="math",
        description="Differentiation rules and applications",
        difficulty=0.55,
        estimated_hours=6.0,
        concepts=["derivative definition", "power rule", "chain rule", "product rule"],
        skills=["differentiation", "finding tangent lines", "optimization"],
    ),
    Topic(
        id="integrals",
        name="Integrals",
        domain="math",
        description="Integration techniques and applications",
        difficulty=0.6,
        estimated_hours=8.0,
        concepts=["antiderivative", "definite integral", "FTC", "area under curve"],
        skills=["basic integration", "substitution", "area calculation"],
    ),
    Topic(
        id="integration-techniques",
        name="Integration Techniques",
        domain="math",
        description="Advanced integration methods",
        difficulty=0.65,
        estimated_hours=6.0,
        concepts=["integration by parts", "partial fractions", "trig substitution"],
        skills=["choosing techniques", "complex integrals"],
    ),
    Topic(
        id="sequences-series",
        name="Sequences and Series",
        domain="math",
        description="Infinite sequences and series",
        difficulty=0.6,
        estimated_hours=6.0,
        concepts=["convergence", "divergence", "Taylor series", "power series"],
        skills=["convergence tests", "finding sums", "Taylor expansion"],
    ),
    Topic(
        id="multivariable-calculus",
        name="Multivariable Calculus",
        domain="math",
        description="Calculus in multiple dimensions",
        difficulty=0.7,
        estimated_hours=10.0,
        concepts=["partial derivatives", "gradients", "multiple integrals", "vector fields"],
        skills=["partial differentiation", "multiple integration", "vector calculus"],
    ),
    # Linear Algebra
    Topic(
        id="vectors",
        name="Vectors",
        domain="math",
        description="Vector operations and geometry",
        difficulty=0.4,
        estimated_hours=4.0,
        concepts=["vector addition", "scalar multiplication", "dot product", "cross product"],
        skills=["vector operations", "geometric interpretation"],
    ),
    Topic(
        id="matrices",
        name="Matrices",
        domain="math",
        description="Matrix operations and properties",
        difficulty=0.45,
        estimated_hours=5.0,
        concepts=["matrix multiplication", "transpose", "inverse", "determinant"],
        skills=["matrix arithmetic", "finding inverses", "solving systems"],
    ),
    Topic(
        id="linear-transformations",
        name="Linear Transformations",
        domain="math",
        description="Linear maps and their properties",
        difficulty=0.55,
        estimated_hours=4.0,
        concepts=["kernel", "image", "rank", "nullity"],
        skills=["finding matrix representations", "analyzing transformations"],
    ),
    Topic(
        id="eigenvalues",
        name="Eigenvalues and Eigenvectors",
        domain="math",
        description="Eigentheory and diagonalization",
        difficulty=0.6,
        estimated_hours=5.0,
        concepts=["eigenvalue", "eigenvector", "characteristic polynomial", "diagonalization"],
        skills=["finding eigenvalues", "diagonalizing matrices"],
    ),
]

# Prerequisite relationships (topic_id -> list of prerequisite topic_ids)
MATH_PREREQUISITES = {
    "fractions": ["arithmetic"],
    "algebra-basics": ["arithmetic"],
    "linear-equations": ["algebra-basics"],
    "quadratics": ["linear-equations"],
    "functions": ["algebra-basics"],
    "trigonometry": ["functions", "algebra-basics"],
    "limits": ["functions", "algebra-basics"],
    "derivatives": ["limits"],
    "integrals": ["derivatives"],
    "integration-techniques": ["integrals"],
    "sequences-series": ["limits", "integrals"],
    "multivariable-calculus": ["integrals", "vectors"],
    "vectors": ["algebra-basics"],
    "matrices": ["vectors", "linear-equations"],
    "linear-transformations": ["matrices"],
    "eigenvalues": ["linear-transformations", "quadratics"],
}


# Computer Science topics
CS_TOPICS = [
    Topic(
        id="programming-basics",
        name="Programming Basics",
        domain="cs",
        description="Variables, control flow, functions",
        difficulty=0.2,
        estimated_hours=6.0,
        concepts=["variables", "loops", "conditionals", "functions"],
        skills=["writing simple programs", "debugging"],
    ),
    Topic(
        id="data-structures",
        name="Data Structures",
        domain="cs",
        description="Arrays, linked lists, stacks, queues",
        difficulty=0.4,
        estimated_hours=8.0,
        concepts=["arrays", "linked lists", "stacks", "queues", "trees"],
        skills=["implementing data structures", "choosing appropriate structures"],
    ),
    Topic(
        id="algorithms",
        name="Algorithms",
        domain="cs",
        description="Sorting, searching, complexity analysis",
        difficulty=0.5,
        estimated_hours=10.0,
        concepts=["big-O", "sorting", "searching", "recursion"],
        skills=["algorithm analysis", "implementing algorithms"],
    ),
    Topic(
        id="graphs",
        name="Graph Algorithms",
        domain="cs",
        description="Graph representations and algorithms",
        difficulty=0.6,
        estimated_hours=8.0,
        concepts=["BFS", "DFS", "shortest paths", "minimum spanning trees"],
        skills=["graph traversal", "implementing graph algorithms"],
    ),
    Topic(
        id="dynamic-programming",
        name="Dynamic Programming",
        domain="cs",
        description="Optimal substructure and memoization",
        difficulty=0.65,
        estimated_hours=8.0,
        concepts=["memoization", "tabulation", "optimal substructure"],
        skills=["identifying DP problems", "formulating recurrences"],
    ),
]

CS_PREREQUISITES = {
    "data-structures": ["programming-basics"],
    "algorithms": ["data-structures"],
    "graphs": ["algorithms"],
    "dynamic-programming": ["algorithms"],
}
