# Johny - Study & Learning System

Johny is a learning coach persona specializing in deliberate practice for mathematics and informatics. Inspired by Math Academy's mastery-based approach and Anders Ericsson's research on deliberate practice.

> **Fork note** — This repo is vendored into agent-core and exposed as the Johny persona. If you're using agent-core, you do not need to install Johny separately; run the agent-core systemd daemon instead.

## Release

- **Version:** v0.1.0-20260114
- **Distribution:** bundled with agent-core

## Core Philosophy

| Principle | Description |
|-----------|-------------|
| **No passive learning** | Always engage actively with problems |
| **Mastery before advancement** | Don't skip prerequisites |
| **Immediate feedback** | Know if you're right/wrong instantly |
| **Appropriate challenge** | Stay in the zone of proximal development |
| **Spaced repetition** | Build long-term retention |

## Architecture

```
johny/
├── knowledge/           # Knowledge graph system
│   ├── graph.py        # DAG of topics with prerequisites
│   └── topics.py       # Topic definitions (math, CS)
├── mastery/            # Mastery tracking
│   ├── tracker.py      # Student progress tracking
│   └── levels.py       # Mastery level definitions
├── practice/           # Practice sessions
│   └── session.py      # Deliberate practice sessions
├── review/             # Spaced repetition
│   ├── scheduler.py    # Review scheduling
│   └── ebbinghaus.py   # Forgetting curve model
└── scripts/
    └── johny_cli.py    # CLI interface
```

## Knowledge Graph

The knowledge graph is a Directed Acyclic Graph (DAG) that models:
- **Nodes**: Learning topics
- **Edges**: "is prerequisite for" relationships
- **Paths**: Optimal learning sequences

### Key Features

```python
from johny.knowledge import KnowledgeGraph

kg = KnowledgeGraph()
kg.add_topic(topic)
kg.add_prerequisite("calculus", "algebra")  # algebra before calculus

# Query prerequisites
prereqs = kg.get_prerequisites("calculus")
all_prereqs = kg.get_all_prerequisites("calculus")  # transitive

# Find learning path
path = kg.get_learning_path("calculus")  # topologically ordered

# Find next topics
ready = kg.get_ready_topics(mastered_topics)
```

### Built-in Topic Sets

| Domain | Topics | Prerequisites |
|--------|--------|---------------|
| Mathematics | Algebra, Calculus, Linear Algebra, Discrete Math | MATH_PREREQUISITES |
| Computer Science | Data Structures, Algorithms, Competitive Programming | CS_PREREQUISITES |

## Mastery Levels

```
Level 0: Never seen
Level 1: Introduced      (< 50% accuracy)
Level 2: Developing      (50-70% accuracy)
Level 3: Proficient      (70-90% accuracy)
Level 4: Mastered        (> 90% accuracy + retention)
```

### Advancement Criteria

To advance from Level N to N+1:
1. Accuracy threshold met for 3+ consecutive sessions
2. Demonstrated retention after 7 days
3. Successfully applied in varied problem contexts

## Practice Sessions

Johny facilitates structured practice based on deliberate practice principles:

### Session Structure

1. **Warm-up (5 min)**: Review prerequisites, recall concepts, set goals
2. **Main Practice (25 min)**: Focused work in the stretch zone
3. **Feedback**: Immediate error correction and hints
4. **Cool-down (5 min)**: Reflection and spaced repetition scheduling

### Difficulty Calibration

Target success rate: **70-85%**
- Too easy (>85%): Increase difficulty
- Too hard (<70%): Add scaffolding or review prerequisites

## Spaced Repetition

Review scheduling based on the Ebbinghaus forgetting curve:

| After Mastery | Review Interval |
|---------------|-----------------|
| Initial | 1 day |
| First review | 3 days |
| Second review | 7 days |
| Third review | 14 days |
| Subsequent | 30+ days |

Reviews are triggered when retention probability drops below threshold.

## Skills (Claude Code Integration)

Johny exposes skills for use with agent-core:

| Skill | Trigger | Purpose |
|-------|---------|---------|
| `/deliberate-practice` | practice, drill, exercise | Structured practice with feedback |
| `/concept-exploration` | explain, understand, why | Socratic questioning for understanding |
| `/problem-solving` | solve, problem, stuck | Scaffolded problem work |
| `/progress-tracking` | progress, status, review | Learning metrics and planning |

## Teaching Methods

### For New Concepts
1. Check prerequisites (using knowledge graph)
2. Introduce with simple examples
3. Build to harder cases
4. Test understanding with varied problems

### When Student is Stuck
1. **Ask**: What have you tried?
2. **Strategic hint**: High-level direction
3. **Tactical hint**: Specific step guidance
4. **Direct guidance**: Last resort
5. **Always**: Have them redo after help

## Integration with Personas

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  JOHNY  │ <-> │   ZEE   │ <-> │ STANLEY │
│ Learning│     │ Personal│     │ Research│
└────┬────┘     └────┬────┘     └────┬────┘
     │               │               │
     └───────────────┴───────────────┘
                     │
              Shared Memory (Qdrant)
```

### Handoffs

- **To Zee**: Scheduling study sessions, reminders, personal matters
- **To Stanley**: Finding resources, technical research, financial examples for probability

## Usage

### With agent-core daemon

```bash
# Start daemon (spawns gateway)
agent-core daemon

# Route to Johny via persona selection
curl -X POST http://127.0.0.1:3210/session \
  -H "Content-Type: application/json" \
  -d '{"agent": "johny"}'
```

### CLI

```bash
cd ~/Repositories/personas/johny
python scripts/johny_cli.py
```

## Configuration

Student profile stored at `~/.zee/johny/profile.json`:

```json
{
  "name": "Student Name",
  "mastery": {
    "algebra": 3,
    "calculus": 1,
    "discrete_math": 2
  },
  "lastReview": {
    "algebra": "2025-01-10T00:00:00Z"
  },
  "preferences": {
    "sessionLength": 30,
    "difficulty": "adaptive"
  }
}
```

## Focus Areas

| Domain | Topics |
|--------|--------|
| Mathematics | Algebra, Calculus, Discrete Math, Linear Algebra, Probability |
| Informatics | Algorithms, Data Structures, Competitive Programming |
| Meta-learning | Study techniques, problem-solving strategies |

---

*Johny is part of the Personas triad: Zee (personal), Stanley (investing), Johny (learning). Orchestrated by agent-core.*
