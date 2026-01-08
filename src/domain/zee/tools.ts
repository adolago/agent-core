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
import {
  getTodayEvents,
  getWeekEvents,
  getMonthEvents,
  listEvents,
  formatEventsForCanvas,
  checkCredentialsExist,
  type FormattedEvent,
} from "./google/calendar.js";
import { requestDaemon } from "../../daemon/ipc-client.js";

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
  action: z.enum(["list", "today", "week", "month", "show"])
    .describe("Calendar action: list (date range), today, week, month, or show (display in canvas)"),
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }).optional().describe("Date range for 'list' action (ISO dates)"),
  showInCanvas: z.boolean().default(true)
    .describe("Display results in canvas sidecar"),
  year: z.number().optional().describe("Year for 'month' action"),
  month: z.number().min(0).max(11).optional().describe("Month (0-11) for 'month' action"),
});

export const calendarTool: ToolDefinition = {
  id: "zee:calendar",
  category: "domain",
  init: async () => ({
    description: `View Google Calendar events and display them in canvas sidecar.

Actions:
- today: Show today's events
- week: Show this week's events
- month: Show this month's events (or specify year/month)
- list: Show events in a custom date range
- show: Just display calendar canvas without fetching new events

Examples:
- Today's events: { action: "today" }
- This week: { action: "week" }
- January 2026: { action: "month", year: 2026, month: 0 }
- Custom range: { action: "list", dateRange: { start: "2026-01-01", end: "2026-01-15" } }
- Display only: { action: "show" }`,
    parameters: CalendarParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { action, dateRange, showInCanvas, year, month } = args;

      ctx.metadata({ title: `Calendar: ${action}` });

      // Check credentials first
      const hasCredentials = await checkCredentialsExist();
      if (!hasCredentials) {
        return {
          title: `Calendar Error`,
          metadata: { action },
          output: `Google Calendar credentials not found.

Please set up OAuth credentials at:
  ~/.zee/credentials/google/oauth-client.json
  ~/.zee/credentials/google/tokens.json

You can create credentials at:
  https://console.cloud.google.com/apis/credentials

Required scopes:
  - https://www.googleapis.com/auth/calendar
  - https://www.googleapis.com/auth/calendar.events`,
        };
      }

      try {
        let events: FormattedEvent[] = [];
        let periodLabel = "";

        if (action === "show") {
          // Just show the canvas with current date
          periodLabel = "Calendar";
        } else if (action === "today") {
          const raw = await getTodayEvents();
          events = formatEventsForCanvas(raw);
          periodLabel = "Today";
        } else if (action === "week") {
          const raw = await getWeekEvents();
          events = formatEventsForCanvas(raw);
          periodLabel = "This Week";
        } else if (action === "month") {
          const raw = await getMonthEvents("primary", year, month);
          events = formatEventsForCanvas(raw);
          const targetDate = new Date(year ?? new Date().getFullYear(), month ?? new Date().getMonth(), 1);
          periodLabel = targetDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        } else if (action === "list" && dateRange) {
          const raw = await listEvents("primary", {
            timeMin: new Date(dateRange.start).toISOString(),
            timeMax: new Date(dateRange.end).toISOString(),
          });
          events = formatEventsForCanvas(raw);
          periodLabel = `${dateRange.start} to ${dateRange.end}`;
        }

        // Format events for display
        const eventsList = events.length > 0
          ? events.map((e) => {
              const time = e.isAllDay ? "All day" : `${e.startTime}${e.endTime ? ` - ${e.endTime}` : ""}`;
              const loc = e.location ? ` @ ${e.location}` : "";
              return `• ${e.date} ${time}: ${e.title}${loc}`;
            }).join("\n")
          : "No events found.";

        // Show in canvas sidecar if requested
        if (showInCanvas) {
          try {
            // Convert events to canvas calendar format
            const canvasEvents = events.map((e) => ({
              date: e.date,
              title: e.title,
            }));

            const targetDate = action === "month" && year && month !== undefined
              ? `${year}-${String(month + 1).padStart(2, "0")}-15`
              : new Date().toISOString().split("T")[0];

            await requestDaemon("canvas:spawn", {
              kind: "calendar",
              id: "zee-calendar",
              config: {
                title: `Calendar: ${periodLabel}`,
                date: targetDate,
                events: canvasEvents,
              },
            });
          } catch (canvasError) {
            // Canvas might not be available, continue without it
          }
        }

        return {
          title: `Calendar: ${periodLabel}`,
          metadata: {
            action,
            eventCount: events.length,
            period: periodLabel,
          },
          output: `${periodLabel} - ${events.length} event(s)

${eventsList}${showInCanvas ? "\n\n📅 Calendar displayed in canvas sidecar." : ""}`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check if it's an auth error
        if (errorMessage.includes("401") || errorMessage.includes("invalid_grant")) {
          return {
            title: `Calendar Auth Error`,
            metadata: { action },
            output: `Google Calendar authentication failed.

Your access token may have expired. Please re-authenticate:
1. Delete ~/.zee/credentials/google/tokens.json
2. Run the OAuth flow again to get new tokens

Error: ${errorMessage}`,
          };
        }

        return {
          title: `Calendar Error`,
          metadata: { action },
          output: `Failed to fetch calendar: ${errorMessage}`,
        };
      }
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
