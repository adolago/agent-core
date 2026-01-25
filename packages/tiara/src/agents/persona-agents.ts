/**
 * Persona-Agent Reconciliation
 *
 * Maps tiara's generic agent capabilities to persona-specific workers.
 * Provides a unified interface for spawning agents through personas.
 *
 * Architecture:
 * - Personas (Zee, Stanley, Johny) are user-facing AI identities
 * - Tiara agents (coder, researcher, tester, etc.) are internal workers
 * - This module bridges them: personas can spawn specialized workers
 *
 * @module tiara/agents/persona-agents
 */

import type { AgentType as TiaraAgentType } from '../swarm/types.js';

// =============================================================================
// Persona Types
// =============================================================================

/**
 * The three personas in the system
 */
export type PersonaId = 'zee' | 'stanley' | 'johny';

/**
 * Worker role within a persona's swarm
 */
export type WorkerRole = 'queen' | 'drone';

/**
 * Persona-specific agent specialization
 */
export type PersonaSpecialization =
  // Zee (Personal Assistant) specializations
  | 'memory-manager'      // Memory and recall
  | 'communicator'        // Messaging across platforms
  | 'scheduler'           // Calendar and reminders
  | 'coordinator'         // Task coordination
  // Stanley (Research Analyst) specializations
  | 'market-analyst'      // Market data analysis
  | 'portfolio-manager'   // Portfolio optimization
  | 'sec-researcher'      // SEC filings research
  | 'quant-analyst'       // Quantitative analysis
  // Johny (Study Assistant) specializations
  | 'tutor'               // Teaching and explanations
  | 'practice-coach'      // Deliberate practice
  | 'curriculum-planner'  // Learning path design
  | 'concept-mapper'      // Knowledge graph building
  // Shared development specializations (any persona can use)
  | 'coder'
  | 'tester'
  | 'reviewer'
  | 'researcher'
  | 'documenter';

// =============================================================================
// Persona Capabilities
// =============================================================================

/**
 * Defines what each persona can do
 */
export interface PersonaCapabilities {
  /** Primary domain of expertise */
  domain: string;
  /** Specializations this persona excels at */
  specializations: PersonaSpecialization[];
  /** Legacy tiara agent types this persona can spawn */
  legacyAgentTypes: TiaraAgentType[];
  /** Tools available to this persona */
  tools: string[];
  /** Default temperature for inference */
  temperature: number;
  /** Maximum concurrent drones */
  maxDrones: number;
}

/**
 * Persona capability definitions
 */
export const PERSONA_CAPABILITIES: Record<PersonaId, PersonaCapabilities> = {
  zee: {
    domain: 'Personal Assistant',
    specializations: [
      'memory-manager',
      'communicator',
      'scheduler',
      'coordinator',
      // Shared
      'coder',
      'tester',
      'reviewer',
      'researcher',
      'documenter',
    ],
    legacyAgentTypes: [
      'coordinator',
      'researcher',
      'coder',
      'reviewer',
      'documenter',
      'monitor',
    ],
    tools: [
      'zee:memory-store',
      'zee:memory-search',
      'zee:messaging',
      'zee:notification',
      'zee:calendar',
      'zee:contacts',
    ],
    temperature: 0.7,
    maxDrones: 3,
  },
  stanley: {
    domain: 'Research Analysis',
    specializations: [
      'market-analyst',
      'portfolio-manager',
      'sec-researcher',
      'quant-analyst',
      // Shared
      'coder',
      'tester',
      'reviewer',
      'researcher',
      'documenter',
    ],
    legacyAgentTypes: [
      'analyst',
      'researcher',
      'coder',
      'reviewer',
      'architect',
      'optimizer',
    ],
    tools: [
      'stanley:market-data',
      'stanley:portfolio',
      'stanley:research',
      'stanley:sec-filings',
      'stanley:nautilus',
    ],
    temperature: 0.3,
    maxDrones: 5,
  },
  johny: {
    domain: 'Learning & Study',
    specializations: [
      'tutor',
      'practice-coach',
      'curriculum-planner',
      'concept-mapper',
      // Shared
      'coder',
      'tester',
      'reviewer',
      'researcher',
      'documenter',
    ],
    legacyAgentTypes: [
      'researcher',
      'coder',
      'tester',
      'reviewer',
      'documenter',
    ],
    tools: [
      'johny:practice',
      'johny:concepts',
      'johny:problems',
      'johny:progress',
    ],
    temperature: 0.5,
    maxDrones: 4,
  },
};

// =============================================================================
// Agent-Persona Mapping
// =============================================================================

/**
 * Maps legacy tiara agent types to the best persona for that task
 */
export const AGENT_TYPE_TO_PERSONA: Record<TiaraAgentType, PersonaId[]> = {
  // Development agents - any persona can handle
  coder: ['zee', 'stanley', 'johny'],
  tester: ['zee', 'stanley', 'johny'],
  reviewer: ['zee', 'stanley', 'johny'],
  documenter: ['zee', 'stanley', 'johny'],

  // Research/Analysis - Stanley preferred
  analyst: ['stanley', 'zee', 'johny'],
  researcher: ['stanley', 'johny', 'zee'],

  // Architecture - Stanley for systems, Johny for learning systems
  architect: ['stanley', 'johny', 'zee'],
  'system-architect': ['stanley', 'zee'],
  'design-architect': ['stanley', 'zee'],

  // Coordination - Zee is the coordinator
  coordinator: ['zee', 'stanley', 'johny'],
  'task-planner': ['zee', 'stanley'],

  // Optimization/Monitoring - Stanley for quantitative
  optimizer: ['stanley', 'zee'],
  monitor: ['zee', 'stanley'],

  // Specialized - domain dependent
  specialist: ['stanley', 'johny', 'zee'],
  developer: ['zee', 'stanley', 'johny'],
  'requirements-engineer': ['zee', 'stanley'],
  'steering-author': ['zee', 'stanley'],
};

/**
 * Maps persona specializations to legacy agent types
 */
export const SPECIALIZATION_TO_AGENT_TYPE: Record<PersonaSpecialization, TiaraAgentType> = {
  // Zee specializations
  'memory-manager': 'coordinator',
  'communicator': 'coordinator',
  'scheduler': 'coordinator',
  'coordinator': 'coordinator',

  // Stanley specializations
  'market-analyst': 'analyst',
  'portfolio-manager': 'analyst',
  'sec-researcher': 'researcher',
  'quant-analyst': 'analyst',

  // Johny specializations
  'tutor': 'researcher',
  'practice-coach': 'tester',
  'curriculum-planner': 'architect',
  'concept-mapper': 'analyst',

  // Shared
  'coder': 'coder',
  'tester': 'tester',
  'reviewer': 'reviewer',
  'researcher': 'researcher',
  'documenter': 'documenter',
};

// =============================================================================
// Worker Definition
// =============================================================================

/**
 * A persona-aware worker definition
 */
export interface PersonaWorker {
  /** Unique worker ID */
  id: string;
  /** Owning persona */
  persona: PersonaId;
  /** Worker role (queen manages, drone executes) */
  role: WorkerRole;
  /** Specialization for this worker */
  specialization: PersonaSpecialization;
  /** Underlying tiara agent type (for compatibility) */
  agentType: TiaraAgentType;
  /** Current status */
  status: 'idle' | 'working' | 'error' | 'terminated';
  /** Task being executed */
  currentTask?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Process ID if spawned as subprocess */
  pid?: number;
  /** WezTerm pane ID if using visual panes */
  paneId?: string;
}

// =============================================================================
// Persona Selection
// =============================================================================

/**
 * Options for selecting a persona for a task
 */
export interface PersonaSelectionOptions {
  /** Task description */
  task: string;
  /** Required capabilities */
  capabilities?: string[];
  /** Preferred persona (if any) */
  preferred?: PersonaId;
  /** Legacy agent type requirement */
  agentType?: TiaraAgentType;
}

/**
 * Select the best persona for a given task
 */
export function selectPersonaForTask(options: PersonaSelectionOptions): PersonaId {
  // If preferred is specified and valid, use it
  if (options.preferred && isValidPersona(options.preferred)) {
    return options.preferred;
  }

  // If agent type is specified, use the mapping
  if (options.agentType) {
    const candidates = AGENT_TYPE_TO_PERSONA[options.agentType];
    if (candidates && candidates.length > 0) {
      return candidates[0];
    }
  }

  // Analyze task description for domain hints
  const taskLower = options.task.toLowerCase();

  // Financial/market keywords → Stanley
  if (
    taskLower.includes('market') ||
    taskLower.includes('portfolio') ||
    taskLower.includes('trading') ||
    taskLower.includes('investment') ||
    taskLower.includes('sec') ||
    taskLower.includes('financial') ||
    taskLower.includes('stock') ||
    taskLower.includes('analysis') ||
    taskLower.includes('earnings') ||
    taskLower.includes('quarterly') ||
    taskLower.includes('q1') ||
    taskLower.includes('q2') ||
    taskLower.includes('q3') ||
    taskLower.includes('q4') ||
    taskLower.includes('backtest') ||
    taskLower.includes('hedge') ||
    taskLower.includes('dividend')
  ) {
    return 'stanley';
  }

  // Learning/study keywords → Johny
  if (
    taskLower.includes('learn') ||
    taskLower.includes('study') ||
    taskLower.includes('practice') ||
    taskLower.includes('teach') ||
    taskLower.includes('explain') ||
    taskLower.includes('curriculum') ||
    taskLower.includes('math') ||
    taskLower.includes('algorithm')
  ) {
    return 'johny';
  }

  // Personal/coordination keywords → Zee
  if (
    taskLower.includes('remind') ||
    taskLower.includes('calendar') ||
    taskLower.includes('message') ||
    taskLower.includes('email') ||
    taskLower.includes('contact') ||
    taskLower.includes('schedule') ||
    taskLower.includes('coordinate')
  ) {
    return 'zee';
  }

  // Check capabilities if provided
  if (options.capabilities) {
    for (const cap of options.capabilities) {
      const capLower = cap.toLowerCase();

      if (capLower.includes('market') || capLower.includes('quant')) {
        return 'stanley';
      }
      if (capLower.includes('learn') || capLower.includes('teach')) {
        return 'johny';
      }
      if (capLower.includes('memory') || capLower.includes('message')) {
        return 'zee';
      }
    }
  }

  // Default to Zee (general-purpose personal assistant)
  return 'zee';
}

/**
 * Check if a persona can handle a specific agent type
 */
export function personaCanHandle(persona: PersonaId, agentType: TiaraAgentType): boolean {
  const caps = PERSONA_CAPABILITIES[persona];
  return caps.legacyAgentTypes.includes(agentType);
}

/**
 * Check if a persona supports a specialization
 */
export function personaHasSpecialization(
  persona: PersonaId,
  specialization: PersonaSpecialization
): boolean {
  const caps = PERSONA_CAPABILITIES[persona];
  return caps.specializations.includes(specialization);
}

/**
 * Get the best specialization for a task within a persona
 */
export function selectSpecialization(
  persona: PersonaId,
  task: string
): PersonaSpecialization {
  const caps = PERSONA_CAPABILITIES[persona];
  const taskLower = task.toLowerCase();

  // Persona-specific matching
  switch (persona) {
    case 'stanley':
      if (taskLower.includes('market') || taskLower.includes('stock')) {
        return 'market-analyst';
      }
      if (taskLower.includes('portfolio')) {
        return 'portfolio-manager';
      }
      if (taskLower.includes('sec') || taskLower.includes('filing')) {
        return 'sec-researcher';
      }
      if (taskLower.includes('quant') || taskLower.includes('backtest')) {
        return 'quant-analyst';
      }
      break;

    case 'johny':
      if (taskLower.includes('teach') || taskLower.includes('explain')) {
        return 'tutor';
      }
      if (taskLower.includes('practice') || taskLower.includes('exercise')) {
        return 'practice-coach';
      }
      if (taskLower.includes('curriculum') || taskLower.includes('plan')) {
        return 'curriculum-planner';
      }
      if (taskLower.includes('concept') || taskLower.includes('knowledge')) {
        return 'concept-mapper';
      }
      break;

    case 'zee':
      if (taskLower.includes('remember') || taskLower.includes('memory')) {
        return 'memory-manager';
      }
      if (taskLower.includes('message') || taskLower.includes('send')) {
        return 'communicator';
      }
      if (taskLower.includes('schedule') || taskLower.includes('calendar')) {
        return 'scheduler';
      }
      if (taskLower.includes('coordinate') || taskLower.includes('delegate')) {
        return 'coordinator';
      }
      break;
  }

  // Shared development specializations
  // Check review before code (since "review code" should be reviewer, not coder)
  if (taskLower.includes('review')) {
    return 'reviewer';
  }
  if (taskLower.includes('test')) {
    return 'tester';
  }
  if (taskLower.includes('code') || taskLower.includes('implement')) {
    return 'coder';
  }
  if (taskLower.includes('research') || taskLower.includes('find')) {
    return 'researcher';
  }
  if (taskLower.includes('document') || taskLower.includes('doc')) {
    return 'documenter';
  }

  // Default based on persona's primary function
  const defaults: Record<PersonaId, PersonaSpecialization> = {
    zee: 'coordinator',
    stanley: 'market-analyst',
    johny: 'tutor',
  };

  return defaults[persona];
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a string is a valid persona ID
 */
export function isValidPersona(id: string): id is PersonaId {
  return id === 'zee' || id === 'stanley' || id === 'johny';
}

/**
 * Get persona capabilities
 */
export function getPersonaCapabilities(persona: PersonaId): PersonaCapabilities {
  return PERSONA_CAPABILITIES[persona];
}

/**
 * List all personas
 */
export function listPersonas(): PersonaId[] {
  return ['zee', 'stanley', 'johny'];
}

/**
 * Generate a worker ID
 */
export function generateWorkerId(persona: PersonaId, role: WorkerRole): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${role}-${persona}-${timestamp}-${random}`;
}

/**
 * Create a persona worker
 */
export function createPersonaWorker(
  persona: PersonaId,
  role: WorkerRole,
  task?: string
): PersonaWorker {
  const specialization = task ? selectSpecialization(persona, task) : 'coordinator';
  const agentType = SPECIALIZATION_TO_AGENT_TYPE[specialization];
  const now = Date.now();

  return {
    id: generateWorkerId(persona, role),
    persona,
    role,
    specialization,
    agentType,
    status: 'idle',
    currentTask: task,
    createdAt: now,
    lastActivityAt: now,
  };
}

/**
 * Get the legacy agent type for a worker's specialization
 */
export function getAgentTypeForWorker(worker: PersonaWorker): TiaraAgentType {
  return SPECIALIZATION_TO_AGENT_TYPE[worker.specialization];
}

// =============================================================================
// Exports
// =============================================================================

export default {
  // Types (exported at module level)

  // Constants
  PERSONA_CAPABILITIES,
  AGENT_TYPE_TO_PERSONA,
  SPECIALIZATION_TO_AGENT_TYPE,

  // Functions
  selectPersonaForTask,
  personaCanHandle,
  personaHasSpecialization,
  selectSpecialization,
  isValidPersona,
  getPersonaCapabilities,
  listPersonas,
  generateWorkerId,
  createPersonaWorker,
  getAgentTypeForWorker,
};
