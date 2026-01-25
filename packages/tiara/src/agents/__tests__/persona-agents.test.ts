/**
 * Tests for Persona-Agent Reconciliation
 */

import { describe, test, expect } from 'bun:test';
import {
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
  PERSONA_CAPABILITIES,
  AGENT_TYPE_TO_PERSONA,
  SPECIALIZATION_TO_AGENT_TYPE,
  type PersonaId,
  type PersonaSpecialization,
} from '../persona-agents.js';

describe('Persona-Agent Reconciliation', () => {
  // ===========================================================================
  // Persona Validation
  // ===========================================================================

  describe('isValidPersona', () => {
    test('validates zee', () => {
      expect(isValidPersona('zee')).toBe(true);
    });

    test('validates stanley', () => {
      expect(isValidPersona('stanley')).toBe(true);
    });

    test('validates johny', () => {
      expect(isValidPersona('johny')).toBe(true);
    });

    test('rejects invalid persona', () => {
      expect(isValidPersona('invalid')).toBe(false);
      expect(isValidPersona('')).toBe(false);
      expect(isValidPersona('alice')).toBe(false);
    });
  });

  describe('listPersonas', () => {
    test('returns all three personas', () => {
      const personas = listPersonas();
      expect(personas).toContain('zee');
      expect(personas).toContain('stanley');
      expect(personas).toContain('johny');
      expect(personas.length).toBe(3);
    });
  });

  // ===========================================================================
  // Persona Capabilities
  // ===========================================================================

  describe('PERSONA_CAPABILITIES', () => {
    test('zee has personal assistant domain', () => {
      const caps = PERSONA_CAPABILITIES.zee;
      expect(caps.domain).toBe('Personal Assistant');
      expect(caps.temperature).toBe(0.7);
    });

    test('stanley has research analysis domain', () => {
      const caps = PERSONA_CAPABILITIES.stanley;
      expect(caps.domain).toBe('Research Analysis');
      expect(caps.temperature).toBe(0.3);
    });

    test('johny has learning domain', () => {
      const caps = PERSONA_CAPABILITIES.johny;
      expect(caps.domain).toBe('Learning & Study');
      expect(caps.temperature).toBe(0.5);
    });

    test('all personas have required fields', () => {
      for (const persona of listPersonas()) {
        const caps = PERSONA_CAPABILITIES[persona];
        expect(caps.domain).toBeDefined();
        expect(caps.specializations.length).toBeGreaterThan(0);
        expect(caps.legacyAgentTypes.length).toBeGreaterThan(0);
        expect(caps.tools.length).toBeGreaterThan(0);
        expect(caps.maxDrones).toBeGreaterThan(0);
      }
    });
  });

  describe('getPersonaCapabilities', () => {
    test('returns capabilities for each persona', () => {
      expect(getPersonaCapabilities('zee')).toEqual(PERSONA_CAPABILITIES.zee);
      expect(getPersonaCapabilities('stanley')).toEqual(PERSONA_CAPABILITIES.stanley);
      expect(getPersonaCapabilities('johny')).toEqual(PERSONA_CAPABILITIES.johny);
    });
  });

  // ===========================================================================
  // Agent Type Mapping
  // ===========================================================================

  describe('AGENT_TYPE_TO_PERSONA', () => {
    test('coder can be handled by any persona', () => {
      const personas = AGENT_TYPE_TO_PERSONA.coder;
      expect(personas).toContain('zee');
      expect(personas).toContain('stanley');
      expect(personas).toContain('johny');
    });

    test('analyst prefers stanley', () => {
      const personas = AGENT_TYPE_TO_PERSONA.analyst;
      expect(personas[0]).toBe('stanley');
    });

    test('coordinator prefers zee', () => {
      const personas = AGENT_TYPE_TO_PERSONA.coordinator;
      expect(personas[0]).toBe('zee');
    });
  });

  describe('personaCanHandle', () => {
    test('zee can handle coordinator', () => {
      expect(personaCanHandle('zee', 'coordinator')).toBe(true);
    });

    test('stanley can handle analyst', () => {
      expect(personaCanHandle('stanley', 'analyst')).toBe(true);
    });

    test('johny can handle researcher', () => {
      expect(personaCanHandle('johny', 'researcher')).toBe(true);
    });

    test('all personas can handle coder', () => {
      expect(personaCanHandle('zee', 'coder')).toBe(true);
      expect(personaCanHandle('stanley', 'coder')).toBe(true);
      expect(personaCanHandle('johny', 'coder')).toBe(true);
    });
  });

  // ===========================================================================
  // Specialization Mapping
  // ===========================================================================

  describe('SPECIALIZATION_TO_AGENT_TYPE', () => {
    test('maps zee specializations', () => {
      expect(SPECIALIZATION_TO_AGENT_TYPE['memory-manager']).toBe('coordinator');
      expect(SPECIALIZATION_TO_AGENT_TYPE['communicator']).toBe('coordinator');
      expect(SPECIALIZATION_TO_AGENT_TYPE['scheduler']).toBe('coordinator');
    });

    test('maps stanley specializations', () => {
      expect(SPECIALIZATION_TO_AGENT_TYPE['market-analyst']).toBe('analyst');
      expect(SPECIALIZATION_TO_AGENT_TYPE['portfolio-manager']).toBe('analyst');
      expect(SPECIALIZATION_TO_AGENT_TYPE['sec-researcher']).toBe('researcher');
    });

    test('maps johny specializations', () => {
      expect(SPECIALIZATION_TO_AGENT_TYPE['tutor']).toBe('researcher');
      expect(SPECIALIZATION_TO_AGENT_TYPE['practice-coach']).toBe('tester');
      expect(SPECIALIZATION_TO_AGENT_TYPE['curriculum-planner']).toBe('architect');
    });

    test('maps shared specializations', () => {
      expect(SPECIALIZATION_TO_AGENT_TYPE['coder']).toBe('coder');
      expect(SPECIALIZATION_TO_AGENT_TYPE['tester']).toBe('tester');
      expect(SPECIALIZATION_TO_AGENT_TYPE['reviewer']).toBe('reviewer');
    });
  });

  describe('personaHasSpecialization', () => {
    test('zee has memory-manager', () => {
      expect(personaHasSpecialization('zee', 'memory-manager')).toBe(true);
    });

    test('stanley has market-analyst', () => {
      expect(personaHasSpecialization('stanley', 'market-analyst')).toBe(true);
    });

    test('johny has tutor', () => {
      expect(personaHasSpecialization('johny', 'tutor')).toBe(true);
    });

    test('zee does not have market-analyst', () => {
      expect(personaHasSpecialization('zee', 'market-analyst')).toBe(false);
    });

    test('all personas have coder', () => {
      expect(personaHasSpecialization('zee', 'coder')).toBe(true);
      expect(personaHasSpecialization('stanley', 'coder')).toBe(true);
      expect(personaHasSpecialization('johny', 'coder')).toBe(true);
    });
  });

  // ===========================================================================
  // Persona Selection
  // ===========================================================================

  describe('selectPersonaForTask', () => {
    test('selects stanley for market analysis', () => {
      expect(selectPersonaForTask({ task: 'Analyze market trends' })).toBe('stanley');
      expect(selectPersonaForTask({ task: 'Review portfolio performance' })).toBe('stanley');
      expect(selectPersonaForTask({ task: 'Research SEC filings' })).toBe('stanley');
    });

    test('selects johny for learning tasks', () => {
      expect(selectPersonaForTask({ task: 'Help me learn calculus' })).toBe('johny');
      expect(selectPersonaForTask({ task: 'Explain this algorithm' })).toBe('johny');
      expect(selectPersonaForTask({ task: 'Create a study plan' })).toBe('johny');
      expect(selectPersonaForTask({ task: 'Practice math problems' })).toBe('johny');
    });

    test('selects zee for personal tasks', () => {
      expect(selectPersonaForTask({ task: 'Schedule a meeting' })).toBe('zee');
      expect(selectPersonaForTask({ task: 'Send a message to John' })).toBe('zee');
      expect(selectPersonaForTask({ task: 'Remember this for later' })).toBe('zee');
      expect(selectPersonaForTask({ task: 'Check my calendar' })).toBe('zee');
    });

    test('respects preferred persona', () => {
      expect(selectPersonaForTask({ task: 'Any task', preferred: 'stanley' })).toBe('stanley');
      expect(selectPersonaForTask({ task: 'Any task', preferred: 'johny' })).toBe('johny');
    });

    test('uses agent type mapping', () => {
      expect(selectPersonaForTask({ task: 'Do something', agentType: 'analyst' })).toBe('stanley');
      expect(selectPersonaForTask({ task: 'Do something', agentType: 'coordinator' })).toBe('zee');
    });

    test('defaults to zee for ambiguous tasks', () => {
      expect(selectPersonaForTask({ task: 'Do something generic' })).toBe('zee');
    });
  });

  // ===========================================================================
  // Specialization Selection
  // ===========================================================================

  describe('selectSpecialization', () => {
    // Stanley specializations
    test('stanley selects market-analyst for market tasks', () => {
      expect(selectSpecialization('stanley', 'Analyze market data')).toBe('market-analyst');
      expect(selectSpecialization('stanley', 'Check stock prices')).toBe('market-analyst');
    });

    test('stanley selects portfolio-manager for portfolio tasks', () => {
      expect(selectSpecialization('stanley', 'Optimize my portfolio')).toBe('portfolio-manager');
    });

    test('stanley selects sec-researcher for SEC tasks', () => {
      expect(selectSpecialization('stanley', 'Read SEC filings')).toBe('sec-researcher');
    });

    // Johny specializations
    test('johny selects tutor for teaching tasks', () => {
      expect(selectSpecialization('johny', 'Teach me algebra')).toBe('tutor');
      expect(selectSpecialization('johny', 'Explain recursion')).toBe('tutor');
    });

    test('johny selects practice-coach for practice tasks', () => {
      expect(selectSpecialization('johny', 'Practice problems')).toBe('practice-coach');
    });

    test('johny selects curriculum-planner for planning tasks', () => {
      expect(selectSpecialization('johny', 'Plan my curriculum')).toBe('curriculum-planner');
    });

    // Zee specializations
    test('zee selects memory-manager for memory tasks', () => {
      expect(selectSpecialization('zee', 'Remember this')).toBe('memory-manager');
    });

    test('zee selects communicator for messaging tasks', () => {
      expect(selectSpecialization('zee', 'Send a message')).toBe('communicator');
    });

    test('zee selects scheduler for calendar tasks', () => {
      expect(selectSpecialization('zee', 'Schedule a meeting')).toBe('scheduler');
    });

    // Shared specializations
    test('selects coder for coding tasks', () => {
      expect(selectSpecialization('zee', 'Implement this feature')).toBe('coder');
      expect(selectSpecialization('stanley', 'Write code for')).toBe('coder');
    });

    test('selects tester for testing tasks', () => {
      expect(selectSpecialization('zee', 'Test this function')).toBe('tester');
    });

    test('selects reviewer for review tasks', () => {
      expect(selectSpecialization('stanley', 'Review this code')).toBe('reviewer');
    });

    // Defaults
    test('defaults to persona-specific specialization', () => {
      expect(selectSpecialization('zee', 'do something')).toBe('coordinator');
      expect(selectSpecialization('stanley', 'do something')).toBe('market-analyst');
      expect(selectSpecialization('johny', 'do something')).toBe('tutor');
    });
  });

  // ===========================================================================
  // Worker Creation
  // ===========================================================================

  describe('generateWorkerId', () => {
    test('generates unique IDs', () => {
      const id1 = generateWorkerId('zee', 'drone');
      const id2 = generateWorkerId('zee', 'drone');
      expect(id1).not.toBe(id2);
    });

    test('includes persona and role in ID', () => {
      const queenId = generateWorkerId('stanley', 'queen');
      const droneId = generateWorkerId('johny', 'drone');

      expect(queenId).toContain('queen');
      expect(queenId).toContain('stanley');
      expect(droneId).toContain('drone');
      expect(droneId).toContain('johny');
    });
  });

  describe('createPersonaWorker', () => {
    test('creates worker with correct persona', () => {
      const worker = createPersonaWorker('stanley', 'drone', 'Analyze market');

      expect(worker.persona).toBe('stanley');
      expect(worker.role).toBe('drone');
      expect(worker.status).toBe('idle');
      expect(worker.currentTask).toBe('Analyze market');
    });

    test('selects appropriate specialization for task', () => {
      const stanleyWorker = createPersonaWorker('stanley', 'drone', 'Analyze market trends');
      expect(stanleyWorker.specialization).toBe('market-analyst');

      const johnyWorker = createPersonaWorker('johny', 'drone', 'Teach me calculus');
      expect(johnyWorker.specialization).toBe('tutor');

      const zeeWorker = createPersonaWorker('zee', 'drone', 'Schedule a meeting');
      expect(zeeWorker.specialization).toBe('scheduler');
    });

    test('defaults to coordinator for queen with no task', () => {
      const worker = createPersonaWorker('zee', 'queen');
      expect(worker.specialization).toBe('coordinator');
    });

    test('sets timestamps', () => {
      const before = Date.now();
      const worker = createPersonaWorker('zee', 'drone');
      const after = Date.now();

      expect(worker.createdAt).toBeGreaterThanOrEqual(before);
      expect(worker.createdAt).toBeLessThanOrEqual(after);
      expect(worker.lastActivityAt).toBe(worker.createdAt);
    });

    test('sets agent type from specialization', () => {
      const worker = createPersonaWorker('stanley', 'drone', 'Analyze data');
      expect(worker.agentType).toBe(SPECIALIZATION_TO_AGENT_TYPE[worker.specialization]);
    });
  });

  describe('getAgentTypeForWorker', () => {
    test('returns correct agent type', () => {
      const worker = createPersonaWorker('stanley', 'drone', 'Analyze market');
      expect(getAgentTypeForWorker(worker)).toBe('analyst');
    });

    test('returns coordinator for coordinator specialization', () => {
      const worker = createPersonaWorker('zee', 'queen');
      expect(getAgentTypeForWorker(worker)).toBe('coordinator');
    });
  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================

  describe('Integration: Persona Selection to Worker Creation', () => {
    test('full flow for financial task', () => {
      const task = 'Analyze Q4 earnings reports';

      // Select persona
      const persona = selectPersonaForTask({ task });
      expect(persona).toBe('stanley');

      // Check capabilities
      const caps = getPersonaCapabilities(persona);
      expect(caps.domain).toBe('Research Analysis');

      // Create worker
      const worker = createPersonaWorker(persona, 'drone', task);
      expect(worker.persona).toBe('stanley');
      expect(worker.agentType).toBe('analyst');
    });

    test('full flow for learning task', () => {
      const task = 'Practice solving differential equations';

      const persona = selectPersonaForTask({ task });
      expect(persona).toBe('johny');

      const worker = createPersonaWorker(persona, 'drone', task);
      expect(worker.specialization).toBe('practice-coach');
      expect(worker.agentType).toBe('tester');
    });

    test('full flow for personal task', () => {
      const task = 'Remember to call mom tomorrow';

      const persona = selectPersonaForTask({ task });
      expect(persona).toBe('zee');

      const worker = createPersonaWorker(persona, 'drone', task);
      expect(worker.specialization).toBe('memory-manager');
    });

    test('full flow for coding task selects any persona', () => {
      const task = 'Implement the sorting algorithm';

      // Defaults to zee for generic coding
      const persona = selectPersonaForTask({ task });

      // Any persona can code
      expect(personaCanHandle(persona, 'coder')).toBe(true);

      const worker = createPersonaWorker(persona, 'drone', task);
      expect(worker.specialization).toBe('coder');
    });
  });

  describe('Edge Cases', () => {
    test('handles empty task string', () => {
      const persona = selectPersonaForTask({ task: '' });
      expect(isValidPersona(persona)).toBe(true);
    });

    test('handles mixed case in task', () => {
      expect(selectPersonaForTask({ task: 'ANALYZE MARKET' })).toBe('stanley');
      expect(selectPersonaForTask({ task: 'Learn Math' })).toBe('johny');
    });

    test('handles special characters in task', () => {
      const persona = selectPersonaForTask({ task: 'What\'s the market doing?' });
      expect(isValidPersona(persona)).toBe(true);
    });
  });
});
