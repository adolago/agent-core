/**
 * Zee Domain Tools
 *
 * Personal assistant tools powered by Clawdis:
 * - Memory management and search
 * - Cross-platform messaging
 * - Notifications and reminders
 * - Contact and calendar management
 */

import { z } from "zod";
import type { ToolDefinition, ToolRuntime, ToolExecutionContext, ToolExecutionResult } from "../../mcp/types";

// =============================================================================
// Memory Store Tool
// =============================================================================

const MemoryStoreParams = z.object({
  content: z.string().describe("Content to remember"),
  category: z.enum(["conversation", "fact", "preference", "task", "decision", "note"])
    .default("note").describe("Memory category"),
  importance: z.number().min(0).max(1).default(0.5)
    .describe("Importance score (0-1)"),
  tags: z.array(z.string()).optional()
    .describe("Tags for categorization"),
  relatedTo: z.array(z.string()).optional()
    .describe("Related memory IDs"),
});

export const memoryStoreTool: ToolDefinition = {
  id: "zee:memory-store",
  category: "domain",
  init: async () => ({
    description: `Store information in long-term memory for future reference.
Use this to remember:
- Important facts about the user
- Preferences and settings
- Tasks and decisions
- Notes from conversations

Examples:
- Remember preference: { content: "User prefers morning meetings", category: "preference" }
- Store fact: { content: "User's birthday is March 15", category: "fact", importance: 0.8 }`,
    parameters: MemoryStoreParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { content, category, importance, tags, relatedTo } = args;

      ctx.metadata({ title: `Storing memory: ${category}` });

      // In production, this calls the Qdrant-backed memory service
      return {
        title: `Memory Stored`,
        metadata: {
          category,
          importance,
          tags,
          surface: ctx.extra?.surface,
        },
        output: `Remembered: "${content.substring(0, 100)}${content.length > 100 ? "..." : ""}"

Memory will be:
- Vectorized for semantic search
- Categorized as: ${category}
- Importance: ${(importance * 100).toFixed(0)}%
${tags?.length ? `- Tagged: ${tags.join(", ")}` : ""}

This memory can be recalled later using zee:memory-search.`,
      };
    },
  }),
};

// =============================================================================
// Memory Search Tool
// =============================================================================

const MemorySearchParams = z.object({
  query: z.string().describe("Search query"),
  category: z.enum(["conversation", "fact", "preference", "task", "decision", "note", "all"])
    .optional().describe("Filter by category"),
  limit: z.number().default(5).describe("Maximum results"),
  threshold: z.number().min(0).max(1).default(0.7)
    .describe("Minimum similarity threshold"),
  timeRange: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
  }).optional().describe("Filter by time range"),
});

export const memorySearchTool: ToolDefinition = {
  id: "zee:memory-search",
  category: "domain",
  init: async () => ({
    description: `Search through stored memories using semantic similarity.
The search understands meaning, not just keywords.

Examples:
- Find preferences: { query: "meeting preferences", category: "preference" }
- Search all: { query: "birthday", limit: 3 }
- Recent memories: { query: "what we discussed", timeRange: { start: "2024-01-01" } }`,
    parameters: MemorySearchParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { query, category, limit, threshold, timeRange } = args;

      ctx.metadata({ title: `Searching: ${query}` });

      return {
        title: `Memory Search Results`,
        metadata: {
          query,
          category,
          limit,
          threshold,
        },
        output: `[Zee would search memories for: "${query}"]

Search parameters:
- Semantic similarity threshold: ${(threshold * 100).toFixed(0)}%
- Max results: ${limit}
${category && category !== "all" ? `- Category filter: ${category}` : ""}
${timeRange ? `- Time range: ${JSON.stringify(timeRange)}` : ""}

The Qdrant-backed memory system will:
1. Convert query to embedding vector
2. Find semantically similar memories
3. Filter by category and time
4. Return ranked results with scores`,
      };
    },
  }),
};

// =============================================================================
// Messaging Tool
// =============================================================================

const MessagingParams = z.object({
  channel: z.enum(["whatsapp", "telegram", "discord", "email"])
    .describe("Messaging channel"),
  to: z.string().describe("Recipient identifier (phone, username, or email)"),
  message: z.string().describe("Message content"),
  replyTo: z.string().optional().describe("Message ID to reply to"),
  schedule: z.string().optional().describe("ISO date to schedule sending"),
});

export const messagingTool: ToolDefinition = {
  id: "zee:messaging",
  category: "domain",
  init: async () => ({
    description: `Send messages across different platforms.
Supported channels:
- WhatsApp (via Clawdis gateway)
- Telegram
- Discord
- Email

Examples:
- Send WhatsApp: { channel: "whatsapp", to: "+1234567890", message: "Hello!" }
- Schedule email: { channel: "email", to: "user@example.com", message: "...", schedule: "2024-01-15T09:00:00Z" }`,
    parameters: MessagingParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { channel, to, message, replyTo, schedule } = args;

      ctx.metadata({ title: `Sending via ${channel}` });

      return {
        title: `Message: ${channel}`,
        metadata: {
          channel,
          to,
          scheduled: !!schedule,
          hasReply: !!replyTo,
        },
        output: `[Zee would send message via ${channel}]

Channel: ${channel}
To: ${to}
${replyTo ? `Reply to: ${replyTo}` : ""}
${schedule ? `Scheduled: ${schedule}` : "Sending immediately"}

Message preview:
"${message.substring(0, 200)}${message.length > 200 ? "..." : ""}"

Note: Actual sending requires channel authentication and user consent.`,
      };
    },
  }),
};

// =============================================================================
// Notification Tool
// =============================================================================

const NotificationParams = z.object({
  type: z.enum(["alert", "reminder", "summary", "update"])
    .describe("Notification type"),
  title: z.string().describe("Notification title"),
  body: z.string().describe("Notification body"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal")
    .describe("Priority level"),
  schedule: z.string().optional()
    .describe("ISO date or cron expression for scheduling"),
  channels: z.array(z.enum(["push", "whatsapp", "email", "telegram"])).default(["push"])
    .describe("Channels to notify through"),
});

export const notificationTool: ToolDefinition = {
  id: "zee:notification",
  category: "domain",
  init: async () => ({
    description: `Create notifications and reminders.
Types:
- alert: Immediate attention needed
- reminder: Scheduled reminder
- summary: Daily/weekly summaries
- update: Status updates

Examples:
- Set reminder: { type: "reminder", title: "Meeting", body: "Team standup", schedule: "2024-01-15T09:00:00Z" }
- Urgent alert: { type: "alert", title: "Important", body: "...", priority: "urgent" }`,
    parameters: NotificationParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { type, title, body, priority, schedule, channels } = args;

      ctx.metadata({ title: `Notification: ${title}` });

      return {
        title: `${type.charAt(0).toUpperCase() + type.slice(1)}: ${title}`,
        metadata: {
          type,
          priority,
          scheduled: !!schedule,
          channels,
        },
        output: `[Zee would create ${type}]

Title: ${title}
Body: ${body}
Priority: ${priority}
${schedule ? `Schedule: ${schedule}` : "Immediate"}
Channels: ${channels.join(", ")}

The notification system will:
1. Store the notification/reminder
2. Schedule delivery if needed
3. Send through configured channels
4. Track read/acknowledged status`,
      };
    },
  }),
};

// =============================================================================
// Calendar Tool
// =============================================================================

const CalendarParams = z.object({
  action: z.enum(["list", "create", "update", "delete", "find_time"])
    .describe("Calendar action"),
  event: z.object({
    title: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    description: z.string().optional(),
    attendees: z.array(z.string()).optional(),
  }).optional().describe("Event details"),
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }).optional().describe("Date range for queries"),
  duration: z.number().optional()
    .describe("Duration in minutes (for find_time)"),
});

export const calendarTool: ToolDefinition = {
  id: "zee:calendar",
  category: "domain",
  init: async () => ({
    description: `Manage calendar events and find available time.
Actions:
- list: Show events in a date range
- create: Create new event
- update: Update existing event
- delete: Remove event
- find_time: Find available slots

Examples:
- List today's events: { action: "list", dateRange: { start: "2024-01-15", end: "2024-01-15" } }
- Find 30min slot: { action: "find_time", duration: 30 }`,
    parameters: CalendarParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { action, event, dateRange, duration } = args;

      ctx.metadata({ title: `Calendar: ${action}` });

      return {
        title: `Calendar: ${action}`,
        metadata: {
          action,
          hasEvent: !!event,
          hasDateRange: !!dateRange,
        },
        output: `[Zee would ${action} calendar]

Action: ${action}
${event ? `Event: ${JSON.stringify(event, null, 2)}` : ""}
${dateRange ? `Date range: ${dateRange.start} to ${dateRange.end}` : ""}
${duration ? `Duration: ${duration} minutes` : ""}

Calendar integration:
- Google Calendar API
- Apple Calendar
- Outlook Calendar
- CalDAV support`,
      };
    },
  }),
};

// =============================================================================
// Contacts Tool
// =============================================================================

const ContactsParams = z.object({
  action: z.enum(["search", "get", "create", "update"])
    .describe("Contacts action"),
  query: z.string().optional()
    .describe("Search query (name, email, phone)"),
  contactId: z.string().optional()
    .describe("Contact ID for get/update"),
  data: z.object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }).optional().describe("Contact data"),
});

export const contactsTool: ToolDefinition = {
  id: "zee:contacts",
  category: "domain",
  init: async () => ({
    description: `Manage contact information.
Actions:
- search: Find contacts by name, email, or phone
- get: Get specific contact details
- create: Add new contact
- update: Update contact info

Examples:
- Search: { action: "search", query: "John" }
- Get: { action: "get", contactId: "abc123" }`,
    parameters: ContactsParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { action, query, contactId, data } = args;

      ctx.metadata({ title: `Contacts: ${action}` });

      return {
        title: `Contacts: ${action}`,
        metadata: {
          action,
          hasQuery: !!query,
          hasData: !!data,
        },
        output: `[Zee would ${action} contacts]

Action: ${action}
${query ? `Query: "${query}"` : ""}
${contactId ? `Contact ID: ${contactId}` : ""}
${data ? `Data: ${JSON.stringify(data, null, 2)}` : ""}

Contacts are synced across:
- WhatsApp contacts
- Phone contacts
- Email address book
- Custom contact database`,
      };
    },
  }),
};

import { createZeeBrowserTool } from "./browser-tool";
import { createZeeCodexBarTool } from "./codexbar-tool";

// =============================================================================
// Exports
// =============================================================================

export const ZEE_TOOLS = [
  memoryStoreTool,
  memorySearchTool,
  messagingTool,
  notificationTool,
  calendarTool,
  contactsTool,
];

// Dynamically created tools
export const DYNAMIC_ZEE_TOOLS = [
  createZeeBrowserTool(),
  createZeeCodexBarTool(),
];

export function registerZeeTools(registry: { register: (tool: ToolDefinition, options: { source: string }) => void }): void {
  for (const tool of ZEE_TOOLS) {
    registry.register(tool, { source: "domain" });
  }
  for (const tool of DYNAMIC_ZEE_TOOLS) {
    registry.register(tool, { source: "domain" });
  }
}

export { registerZeeTools as registerZeeDomainTools };
