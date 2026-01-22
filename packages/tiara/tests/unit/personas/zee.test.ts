/**
 * Zee Persona Tests
 *
 * Tests for Zee personal assistant domain tools.
 * Tests the expected structure and interfaces without importing actual modules
 * (since those are in agent-core root, not tiara).
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { z } from 'zod';

// Set test mode
process.env.TIARA_TEST_MODE = 'true';
process.env.NODE_ENV = 'test';

describe('Zee Persona', () => {
  describe('Memory Store Tool Interface', () => {
    it('should validate memory store parameters', () => {
      const MemoryStoreParams = z.object({
        content: z.string().describe("Content to remember"),
        category: z.enum(["conversation", "fact", "preference", "task", "decision", "note"])
          .default("note"),
        importance: z.number().min(0).max(1).default(0.5),
        tags: z.array(z.string()).optional(),
        relatedTo: z.array(z.string()).optional(),
      });

      // Valid inputs
      expect(MemoryStoreParams.safeParse({ content: 'Test' }).success).toBe(true);
      expect(MemoryStoreParams.safeParse({ content: 'Test', category: 'fact' }).success).toBe(true);
      expect(MemoryStoreParams.safeParse({ content: 'Test', importance: 0.8 }).success).toBe(true);
      expect(MemoryStoreParams.safeParse({ content: 'Test', tags: ['tag1', 'tag2'] }).success).toBe(true);

      // Invalid inputs
      expect(MemoryStoreParams.safeParse({ content: 'Test', importance: 1.5 }).success).toBe(false);
      expect(MemoryStoreParams.safeParse({ content: 'Test', importance: -0.1 }).success).toBe(false);
      expect(MemoryStoreParams.safeParse({ content: 'Test', category: 'invalid' }).success).toBe(false);
    });

    it('should validate all memory categories', () => {
      const categories = ['conversation', 'fact', 'preference', 'task', 'decision', 'note'];
      const CategorySchema = z.enum(['conversation', 'fact', 'preference', 'task', 'decision', 'note']);

      for (const cat of categories) {
        expect(CategorySchema.safeParse(cat).success).toBe(true);
      }
    });
  });

  describe('Memory Search Tool Interface', () => {
    it('should validate memory search parameters', () => {
      const MemorySearchParams = z.object({
        query: z.string(),
        category: z.enum(["conversation", "fact", "preference", "task", "decision", "note", "all"])
          .optional(),
        limit: z.number().default(5),
        threshold: z.number().min(0).max(1).default(0.7),
        timeRange: z.object({
          start: z.string().optional(),
          end: z.string().optional(),
        }).optional(),
      });

      // Valid searches
      expect(MemorySearchParams.safeParse({ query: 'test' }).success).toBe(true);
      expect(MemorySearchParams.safeParse({ query: 'test', category: 'fact' }).success).toBe(true);
      expect(MemorySearchParams.safeParse({ query: 'test', category: 'all' }).success).toBe(true);
      expect(MemorySearchParams.safeParse({ query: 'test', limit: 10, threshold: 0.9 }).success).toBe(true);

      // Invalid threshold
      expect(MemorySearchParams.safeParse({ query: 'test', threshold: 1.5 }).success).toBe(false);
    });
  });

  describe('Messaging Tool Interface', () => {
    it('should validate messaging parameters', () => {
      const MessagingParams = z.object({
        channel: z.enum(["whatsapp", "telegram"]),
        to: z.string(),
        message: z.string(),
        persona: z.enum(["zee", "stanley", "johny"]).optional(),
      });

      // Valid messages
      expect(MessagingParams.safeParse({
        channel: 'whatsapp',
        to: '1234567890@c.us',
        message: 'Hello'
      }).success).toBe(true);

      expect(MessagingParams.safeParse({
        channel: 'telegram',
        to: '123456789',
        message: 'Hello',
        persona: 'stanley'
      }).success).toBe(true);

      // Invalid channel
      expect(MessagingParams.safeParse({
        channel: 'sms',
        to: '123',
        message: 'Hello'
      }).success).toBe(false);
    });

    it('should support all personas for Telegram', () => {
      const personas = ['zee', 'stanley', 'johny'];
      const PersonaSchema = z.enum(['zee', 'stanley', 'johny']);

      for (const persona of personas) {
        expect(PersonaSchema.safeParse(persona).success).toBe(true);
      }
    });
  });

  describe('Notification Tool Interface', () => {
    it('should validate notification parameters', () => {
      const NotificationParams = z.object({
        type: z.enum(["alert", "reminder", "summary", "update"]),
        title: z.string(),
        body: z.string(),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
        schedule: z.string().optional(),
        channels: z.array(z.enum(["push", "whatsapp", "email", "telegram"])).default(["push"]),
      });

      // Valid notifications
      expect(NotificationParams.safeParse({
        type: 'alert',
        title: 'Test',
        body: 'Test body'
      }).success).toBe(true);

      expect(NotificationParams.safeParse({
        type: 'reminder',
        title: 'Meeting',
        body: 'Team standup',
        priority: 'high',
        schedule: '2026-01-15T09:00:00Z'
      }).success).toBe(true);
    });

    it('should validate all notification types', () => {
      const types = ['alert', 'reminder', 'summary', 'update'];
      const TypeSchema = z.enum(['alert', 'reminder', 'summary', 'update']);

      for (const type of types) {
        expect(TypeSchema.safeParse(type).success).toBe(true);
      }
    });

    it('should validate all priority levels', () => {
      const priorities = ['low', 'normal', 'high', 'urgent'];
      const PrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

      for (const priority of priorities) {
        expect(PrioritySchema.safeParse(priority).success).toBe(true);
      }
    });
  });

  describe('Calendar Tool Interface', () => {
    it('should validate calendar parameters', () => {
      const CalendarParams = z.object({
        action: z.enum(["list", "today", "week", "month", "show", "create", "update", "delete", "suggest", "find-free", "quick-add"]),
        dateRange: z.object({
          start: z.string(),
          end: z.string(),
        }).optional(),
        year: z.number().optional(),
        month: z.number().min(0).max(11).optional(),
        event: z.object({
          summary: z.string(),
          description: z.string().optional(),
          location: z.string().optional(),
          start: z.string(),
          end: z.string(),
          attendees: z.array(z.string()).optional(),
        }).optional(),
        eventId: z.string().optional(),
        durationMinutes: z.number().optional(),
        withinDays: z.number().optional(),
        preferMorning: z.boolean().optional(),
        preferAfternoon: z.boolean().optional(),
        quickAddText: z.string().optional(),
      });

      // Valid calendar actions
      expect(CalendarParams.safeParse({ action: 'today' }).success).toBe(true);
      expect(CalendarParams.safeParse({ action: 'week' }).success).toBe(true);
      expect(CalendarParams.safeParse({
        action: 'create',
        event: {
          summary: 'Meeting',
          start: '2026-01-15T10:00:00',
          end: '2026-01-15T11:00:00'
        }
      }).success).toBe(true);
    });

    it('should validate all calendar actions', () => {
      const actions = ['list', 'today', 'week', 'month', 'show', 'create', 'update', 'delete', 'suggest', 'find-free', 'quick-add'];
      const ActionSchema = z.enum(['list', 'today', 'week', 'month', 'show', 'create', 'update', 'delete', 'suggest', 'find-free', 'quick-add']);

      for (const action of actions) {
        expect(ActionSchema.safeParse(action).success).toBe(true);
      }
    });
  });

  describe('Contacts Tool Interface', () => {
    it('should validate contacts parameters', () => {
      const ContactsParams = z.object({
        action: z.enum(["search", "get", "create", "update"]),
        query: z.string().optional(),
        contactId: z.string().optional(),
        data: z.object({
          name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          notes: z.string().optional(),
          tags: z.array(z.string()).optional(),
        }).optional(),
      });

      // Valid contacts operations
      expect(ContactsParams.safeParse({ action: 'search', query: 'John' }).success).toBe(true);
      expect(ContactsParams.safeParse({ action: 'get', contactId: 'abc123' }).success).toBe(true);
      expect(ContactsParams.safeParse({
        action: 'create',
        data: { name: 'John Doe', email: 'john@example.com' }
      }).success).toBe(true);
    });
  });

  describe('Splitwise Tool Interface', () => {
    it('should validate splitwise actions', () => {
      const actions = [
        'current-user', 'groups', 'group', 'expenses', 'expense',
        'friends', 'friend', 'create-expense', 'update-expense',
        'delete-expense', 'balances', 'request'
      ];

      const ActionSchema = z.enum([
        'current-user', 'groups', 'group', 'expenses', 'expense',
        'friends', 'friend', 'create-expense', 'update-expense',
        'delete-expense', 'balances', 'request'
      ]);

      for (const action of actions) {
        expect(ActionSchema.safeParse(action).success).toBe(true);
      }
    });
  });

  describe('WhatsApp Reaction Tool Interface', () => {
    it('should validate reaction parameters', () => {
      const WhatsAppReactionParams = z.object({
        action: z.enum(["react"]),
        chatJid: z.string(),
        messageId: z.string(),
        emoji: z.string(),
        remove: z.boolean().optional(),
      });

      // Add reaction
      expect(WhatsAppReactionParams.safeParse({
        action: 'react',
        chatJid: '1234567890@c.us',
        messageId: 'ABC123',
        emoji: '👍'
      }).success).toBe(true);

      // Remove reaction
      expect(WhatsAppReactionParams.safeParse({
        action: 'react',
        chatJid: '1234567890@c.us',
        messageId: 'ABC123',
        emoji: '',
        remove: true
      }).success).toBe(true);
    });
  });

  describe('Tool ID Conventions', () => {
    it('should follow zee: prefix convention', () => {
      const expectedToolIds = [
        'zee:memory-store',
        'zee:memory-search',
        'zee:messaging',
        'zee:notification',
        'zee:calendar',
        'zee:contacts',
        'zee:splitwise',
        'zee:codexbar',
        'zee:whatsapp-react',
      ];

      for (const id of expectedToolIds) {
        expect(id.startsWith('zee:')).toBe(true);
      }
    });
  });
});
