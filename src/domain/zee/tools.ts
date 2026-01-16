/**
 * Zee Domain Tools
 *
 * Personal assistant tools powered by Zee gateway:
 * - Memory management and search
 * - Cross-platform messaging
 * - Notifications and reminders
 * - Contact and calendar management
 */

import { z } from "zod";
import type { ToolDefinition, ToolRuntime, ToolExecutionContext, ToolExecutionResult } from "../../mcp/types";
import { Log } from "../../../packages/agent-core/src/util/log";
import {
  SPLITWISE_ACTIONS,
  buildSplitwiseRequest,
  callSplitwiseApi,
  resolveSplitwiseConfig,
  type SplitwiseAction,
  type SplitwiseValue,
} from "./splitwise.js";
import { resolveCodexbarConfig, runCodexbar } from "./codexbar.js";

const log = Log.create({ service: "zee-tools" });

// Schema for gateway API responses
const GatewayResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});
import {
  getTodayEvents,
  getWeekEvents,
  getMonthEvents,
  listEvents,
  formatEventsForCanvas,
  checkCredentialsExist,
  createEvent,
  updateEvent,
  deleteEvent,
  findFreeSlots,
  suggestMeetingTimes,
  quickAddEvent,
  type FormattedEvent,
  type TimeSlot,
} from "./google/calendar.js";
import { getMemory } from "../../memory/unified.js";

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

      try {
        const store = getMemory();
        const entry = await store.save({
          category,
          content,
          metadata: {
            importance,
            tags,
            surface: ctx.extra?.surface as string | undefined,
            sessionId: ctx.extra?.sessionId as string | undefined,
            agent: "zee",
            extra: relatedTo ? { relatedTo } : undefined,
          },
        });

        return {
          title: `Memory Stored`,
          metadata: {
            id: entry.id,
            category,
            importance,
            tags,
          },
          output: `Remembered: "${content.substring(0, 100)}${content.length > 100 ? "..." : ""}"

Memory saved with ID: ${entry.id}
- Category: ${category}
- Importance: ${((importance ?? 0.5) * 100).toFixed(0)}%
${tags?.length ? `- Tags: ${tags.join(", ")}` : ""}

This memory can be recalled later using zee:memory-search.`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Check if it's a connection error (Qdrant not running)
        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: `Memory Store Unavailable`,
            metadata: { error: "connection_failed" },
            output: `Could not connect to memory storage (Qdrant).

The memory was NOT saved. To enable memory:
1. Start Qdrant: docker run -p 6333:6333 qdrant/qdrant
2. Or configure a different backend in agent-core config

Error: ${errorMsg}`,
          };
        }

        return {
          title: `Memory Store Error`,
          metadata: { error: errorMsg },
          output: `Failed to store memory: ${errorMsg}`,
        };
      }
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

      try {
        const store = getMemory();
        const results = await store.search({
          query,
          limit: limit ?? 5,
          threshold: threshold ?? 0.5,
          category: category && category !== "all" ? category as any : undefined,
          timeRange: timeRange ? {
            start: timeRange.start ? new Date(timeRange.start).getTime() : undefined,
            end: timeRange.end ? new Date(timeRange.end).getTime() : undefined,
          } : undefined,
        });

        if (results.length === 0) {
          return {
            title: `No Memories Found`,
            metadata: { query, resultCount: 0 },
            output: `No memories found matching: "${query}"

Try:
- Using different keywords
- Removing category filters
- Expanding the time range`,
          };
        }

        const formattedResults = results.map((r, i) => {
          const preview = r.entry.content.substring(0, 150);
          const ellipsis = r.entry.content.length > 150 ? "..." : "";
          const date = new Date(r.entry.createdAt).toLocaleDateString();
          const score = (r.score * 100).toFixed(0);
          return `${i + 1}. [${r.entry.category}] (${score}% match, ${date})
   "${preview}${ellipsis}"
   ID: ${r.entry.id}`;
        }).join("\n\n");

        return {
          title: `Found ${results.length} Memories`,
          metadata: {
            query,
            resultCount: results.length,
            topScore: results[0]?.score,
          },
          output: `Found ${results.length} memories matching: "${query}"

${formattedResults}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: `Memory Search Unavailable`,
            metadata: { error: "connection_failed" },
            output: `Could not connect to memory storage (Qdrant).

To enable memory search:
1. Start Qdrant: docker run -p 6333:6333 qdrant/qdrant
2. Or configure a different backend in agent-core config

Error: ${errorMsg}`,
          };
        }

        return {
          title: `Memory Search Error`,
          metadata: { error: errorMsg },
          output: `Failed to search memories: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// Messaging Tool
// =============================================================================

const MessagingParams = z.object({
  channel: z.enum(["whatsapp", "telegram"])
    .describe("Messaging channel: whatsapp (Zee) or telegram (Stanley/Johny bots)"),
  to: z.string().describe("Recipient: WhatsApp chatId or Telegram chatId (numeric)"),
  message: z.string().describe("Message content"),
  persona: z.enum(["zee", "stanley", "johny"]).optional()
    .describe("For Telegram: which persona's bot to use (default: stanley)"),
});

export const messagingTool: ToolDefinition = {
  id: "zee:messaging",
  category: "domain",
  init: async () => ({
    description: `Send messages via WhatsApp or Telegram gateways.

Channels:
- **whatsapp**: Zee's WhatsApp gateway (requires active daemon with --whatsapp)
- **telegram**: Stanley/Johny Telegram bots (requires active daemon with --telegram-*)

WhatsApp:
- \`to\`: Chat ID (from incoming message context, e.g., "1234567890@c.us")
- Only Zee can send via WhatsApp

Telegram:
- \`to\`: Numeric chat ID (from incoming message context)
- \`persona\`: Which bot to use - "stanley" (default) or "johny"

Examples:
- WhatsApp: { channel: "whatsapp", to: "1234567890@c.us", message: "Hello!" }
- Telegram via Stanley: { channel: "telegram", to: "123456789", message: "Market update!", persona: "stanley" }`,
    parameters: MessagingParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { channel, to, message, persona } = args;

      ctx.metadata({ title: `Sending via ${channel}` });

      // Get daemon port from environment or default
      const daemonPort = process.env.AGENT_CORE_DAEMON_PORT || "3456";
      const baseUrl = `http://127.0.0.1:${daemonPort}`;

      try {
        if (channel === "whatsapp") {
          // Send via WhatsApp gateway (Zee only)
          const response = await fetch(`${baseUrl}/gateway/whatsapp/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId: to, message }),
          });

          const rawResult = await response.json();
          const parseResult = GatewayResponseSchema.safeParse(rawResult);

          if (!parseResult.success) {
            log.error("WhatsApp gateway response validation failed", {
              errors: parseResult.error.flatten().fieldErrors,
            });
            return {
              title: `WhatsApp Send Failed`,
              metadata: { channel, to, error: "Invalid response from gateway" },
              output: `Failed to send WhatsApp message: Invalid response from gateway`,
            };
          }

          const result = parseResult.data;

          if (!result.success) {
            return {
              title: `WhatsApp Send Failed`,
              metadata: { channel, to, error: result.error },
              output: `Failed to send WhatsApp message: ${result.error || "Unknown error"}

Troubleshooting:
- Ensure daemon is running with --whatsapp flag
- Check WhatsApp connection status
- Verify chatId format (e.g., "1234567890@c.us")`,
            };
          }

          return {
            title: `WhatsApp Message Sent`,
            metadata: { channel, to, success: true },
            output: `Message sent via WhatsApp to ${to}

Preview: "${message.substring(0, 100)}${message.length > 100 ? "..." : ""}"`,
          };

        } else if (channel === "telegram") {
          // Send via Telegram gateway (Stanley/Johny bots)
          const selectedPersona = persona || "stanley";
          const chatId = parseInt(to, 10);

          if (isNaN(chatId)) {
            return {
              title: `Invalid Telegram Chat ID`,
              metadata: { channel, to, error: "invalid_chat_id" },
              output: `Invalid Telegram chat ID: "${to}"

Chat ID must be a numeric value (e.g., 123456789).`,
            };
          }

          const response = await fetch(`${baseUrl}/gateway/telegram/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ persona: selectedPersona, chatId, message }),
          });

          const rawResult = await response.json();
          const parseResult = GatewayResponseSchema.safeParse(rawResult);

          if (!parseResult.success) {
            log.error("Telegram gateway response validation failed", {
              errors: parseResult.error.flatten().fieldErrors,
            });
            return {
              title: `Telegram Send Failed`,
              metadata: { channel, to, persona: selectedPersona, error: "Invalid response from gateway" },
              output: `Failed to send Telegram message via ${selectedPersona}: Invalid response from gateway`,
            };
          }

          const result = parseResult.data;

          if (!result.success) {
            return {
              title: `Telegram Send Failed`,
              metadata: { channel, to, persona: selectedPersona, error: result.error },
              output: `Failed to send Telegram message via ${selectedPersona}: ${result.error || "Unknown error"}

Troubleshooting:
- Ensure daemon is running with --telegram-${selectedPersona}-token flag
- Check bot connection status
- Verify chatId is numeric`,
            };
          }

          return {
            title: `Telegram Message Sent`,
            metadata: { channel, to, persona: selectedPersona, success: true },
            output: `Message sent via Telegram (${selectedPersona} bot) to chat ${to}

Preview: "${message.substring(0, 100)}${message.length > 100 ? "..." : ""}"`,
          };
        }

        return {
          title: `Unsupported Channel`,
          metadata: { channel, error: "unsupported" },
          output: `Channel "${channel}" is not supported. Use "whatsapp" or "telegram".`,
        };

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        return {
          title: `Messaging Error`,
          metadata: { channel, to, error: errorMsg },
          output: `Failed to send message: ${errorMsg}

Troubleshooting:
- Ensure agent-core daemon is running
- Check gateway status with /status command
- Verify network connectivity`,
        };
      }
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
  action: z.enum(["list", "today", "week", "month", "show", "create", "update", "delete", "suggest", "find-free", "quick-add"])
    .describe("Calendar action"),
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }).optional().describe("Date range for 'list' or 'find-free' action (ISO dates)"),
  year: z.number().optional().describe("Year for 'month' action"),
  month: z.number().min(0).max(11).optional().describe("Month (0-11) for 'month' action"),
  // Event creation/update parameters
  event: z.object({
    summary: z.string().describe("Event title"),
    description: z.string().optional(),
    location: z.string().optional(),
    start: z.string().describe("Start time (ISO datetime or YYYY-MM-DD for all-day)"),
    end: z.string().describe("End time (ISO datetime or YYYY-MM-DD for all-day)"),
    attendees: z.array(z.string()).optional().describe("Attendee email addresses"),
  }).optional().describe("Event details for create/update"),
  eventId: z.string().optional().describe("Event ID for update/delete"),
  // Smart scheduling parameters
  durationMinutes: z.number().optional().describe("Meeting duration for 'suggest' action"),
  withinDays: z.number().optional().describe("Search window in days (default: 7)"),
  preferMorning: z.boolean().optional().describe("Prefer morning slots"),
  preferAfternoon: z.boolean().optional().describe("Prefer afternoon slots"),
  quickAddText: z.string().optional().describe("Natural language event for 'quick-add'"),
});

export const calendarTool: ToolDefinition = {
  id: "zee:calendar",
  category: "domain",
  init: async () => ({
    description: `Google Calendar with smart scheduling.

**View Events:**
- today/week/month/list/show: View events

**Manage Events:**
- create: Create event with { event: { summary, start, end, location?, attendees? } }
- update: Update event with { eventId, event: {...} }
- delete: Delete event with { eventId }
- quick-add: Natural language event creation { quickAddText: "Lunch with John tomorrow at noon" }

**Smart Scheduling:**
- suggest: Get optimal meeting time suggestions { durationMinutes, withinDays?, preferMorning?, preferAfternoon? }
- find-free: Find available time slots { dateRange: {start, end}, durationMinutes }

Examples:
- { action: "today" }
- { action: "create", event: { summary: "Team Meeting", start: "2026-01-15T10:00:00", end: "2026-01-15T11:00:00" } }
- { action: "suggest", durationMinutes: 30, preferMorning: true }
- { action: "quick-add", quickAddText: "Coffee with Sarah tomorrow 3pm" }`,
    parameters: CalendarParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { action, dateRange, year, month, event, eventId, durationMinutes, withinDays, preferMorning, preferAfternoon, quickAddText } = args;

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
        // Handle event management actions
        if (action === "create" && event) {
          const isAllDay = !event.start.includes("T");
          const created = await createEvent("primary", {
            summary: event.summary,
            description: event.description,
            location: event.location,
            start: isAllDay ? { date: event.start } : { dateTime: event.start },
            end: isAllDay ? { date: event.end } : { dateTime: event.end },
            attendees: event.attendees?.map(email => ({ email })),
          });
          return {
            title: `Event Created`,
            metadata: { action, eventId: created.id },
            output: `Created event: ${created.summary}
ID: ${created.id}
When: ${created.start.dateTime || created.start.date}
${created.location ? `Where: ${created.location}` : ""}
${created.htmlLink ? `Link: ${created.htmlLink}` : ""}`,
          };
        }

        if (action === "update" && eventId && event) {
          const isAllDay = event.start && !event.start.includes("T");
          const updated = await updateEvent("primary", eventId, {
            summary: event.summary,
            description: event.description,
            location: event.location,
            ...(event.start && { start: isAllDay ? { date: event.start } : { dateTime: event.start } }),
            ...(event.end && { end: isAllDay ? { date: event.end } : { dateTime: event.end } }),
            ...(event.attendees && { attendees: event.attendees.map(email => ({ email })) }),
          });
          return {
            title: `Event Updated`,
            metadata: { action, eventId },
            output: `Updated event: ${updated.summary}
When: ${updated.start.dateTime || updated.start.date}`,
          };
        }

        if (action === "delete" && eventId) {
          await deleteEvent("primary", eventId);
          return {
            title: `Event Deleted`,
            metadata: { action, eventId },
            output: `Deleted event: ${eventId}`,
          };
        }

        if (action === "quick-add" && quickAddText) {
          const created = await quickAddEvent("primary", quickAddText);
          return {
            title: `Event Created (Quick Add)`,
            metadata: { action, eventId: created.id },
            output: `Created: ${created.summary}
When: ${created.start.dateTime || created.start.date}
ID: ${created.id}`,
          };
        }

        // Handle smart scheduling actions
        if (action === "suggest") {
          const duration = durationMinutes || 30;
          const suggestions = await suggestMeetingTimes("primary", {
            durationMinutes: duration,
            withinDays: withinDays || 7,
            preferMorning,
            preferAfternoon,
          });

          if (suggestions.length === 0) {
            return {
              title: `No Available Slots`,
              metadata: { action, durationMinutes: duration },
              output: `No ${duration}-minute slots available in the next ${withinDays || 7} days.`,
            };
          }

          const suggestionsList = suggestions.map((s, i) => {
            const startStr = s.start.toLocaleString("en-US", {
              weekday: "short", month: "short", day: "numeric",
              hour: "numeric", minute: "2-digit",
            });
            const endStr = s.end.toLocaleTimeString("en-US", {
              hour: "numeric", minute: "2-digit",
            });
            return `${i + 1}. ${startStr} - ${endStr} (${s.reason}, score: ${s.score})`;
          }).join("\n");

          return {
            title: `Meeting Suggestions`,
            metadata: { action, count: suggestions.length, durationMinutes: duration },
            output: `Best times for a ${duration}-minute meeting:

${suggestionsList}

To schedule, use: { action: "create", event: { summary: "...", start: "<ISO>", end: "<ISO>" } }`,
          };
        }

        if (action === "find-free" && dateRange && durationMinutes) {
          const slots = await findFreeSlots("primary", {
            startDate: new Date(dateRange.start),
            endDate: new Date(dateRange.end),
            minDurationMinutes: durationMinutes,
          });

          if (slots.length === 0) {
            return {
              title: `No Free Slots`,
              metadata: { action, durationMinutes },
              output: `No ${durationMinutes}-minute free slots between ${dateRange.start} and ${dateRange.end}.`,
            };
          }

          const slotsList = slots.slice(0, 10).map((s) => {
            const startStr = s.start.toLocaleString("en-US", {
              weekday: "short", month: "short", day: "numeric",
              hour: "numeric", minute: "2-digit",
            });
            const endStr = s.end.toLocaleTimeString("en-US", {
              hour: "numeric", minute: "2-digit",
            });
            return `• ${startStr} - ${endStr} (${s.durationMinutes} min available)`;
          }).join("\n");

          return {
            title: `Free Time Slots`,
            metadata: { action, count: slots.length, durationMinutes },
            output: `Found ${slots.length} free slot(s) of ${durationMinutes}+ minutes:

${slotsList}${slots.length > 10 ? `\n... and ${slots.length - 10} more` : ""}`,
          };
        }

        // Handle view actions (original functionality)
        let events: FormattedEvent[] = [];
        let periodLabel = "";

        if (action === "show") {
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

        return {
          title: `Calendar: ${periodLabel}`,
          metadata: { action, eventCount: events.length, period: periodLabel },
          output: `${periodLabel} - ${events.length} event(s)

${eventsList}`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes("401") || errorMessage.includes("invalid_grant")) {
          return {
            title: `Calendar Auth Error`,
            metadata: { action },
            output: `Google Calendar authentication failed. Re-authenticate at ~/.zee/credentials/google/`,
          };
        }

        return {
          title: `Calendar Error`,
          metadata: { action },
          output: `Calendar operation failed: ${errorMessage}`,
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

// =============================================================================
// Splitwise Tool
// =============================================================================

const SplitwiseValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const SplitwiseParams = z.object({
  action: z.enum(SPLITWISE_ACTIONS as [SplitwiseAction, ...SplitwiseAction[]])
    .describe("Splitwise action to perform"),
  groupId: z.number().optional().describe("Group ID for group actions"),
  friendId: z.number().optional().describe("Friend ID for friend actions"),
  expenseId: z.number().optional().describe("Expense ID for expense actions"),
  endpoint: z.string().optional().describe("Endpoint for request action (e.g., get_expenses)"),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional().describe("HTTP method for request action"),
  query: z.record(SplitwiseValueSchema).optional().describe("Query parameters"),
  payload: z.record(SplitwiseValueSchema).optional().describe("Request payload"),
  payloadFormat: z.enum(["json", "form"]).default("json").describe("Payload encoding for POST/PUT"),
  timeoutMs: z.number().optional().describe("Override timeout in ms"),
});

export const splitwiseTool: ToolDefinition = {
  id: "zee:splitwise",
  category: "domain",
  init: async () => ({
    description: `Access Splitwise API for shared expenses and balances.

Requires configuration:
- agent-core.jsonc: { "zee": { "splitwise": { "enabled": true, "token": "{env:SPLITWISE_TOKEN}" } } }

Token sources (when enabled):
- zee.splitwise.token in agent-core.jsonc
- zee.splitwise.tokenFile in agent-core.jsonc
- SPLITWISE_TOKEN environment variable.

Examples:
- Current user: { action: "current-user" }
- List groups: { action: "groups" }
- List expenses: { action: "expenses", query: { group_id: 12345 } }
- Create expense: { action: "create-expense", payload: { cost: "42.50", description: "Dinner", group_id: 12345 } }
- Custom request: { action: "request", endpoint: "get_expenses", method: "GET", query: { dated_after: "2024-01-01" } }`,
    parameters: SplitwiseParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: `Splitwise: ${args.action}` });

      const config = resolveSplitwiseConfig();
      if (!config.enabled) {
        return {
          title: "Splitwise Disabled",
          metadata: { action: args.action, enabled: false },
          output: `Splitwise tooling is disabled.

Enable it in agent-core.jsonc:
{
  "zee": {
    "splitwise": {
      "enabled": true,
      "token": "{env:SPLITWISE_TOKEN}"
    }
  }
}`,
        };
      }

      if (config.error) {
        return {
          title: "Splitwise Configuration Error",
          metadata: { action: args.action, enabled: true },
          output: config.error,
        };
      }

      if (!config.token) {
        return {
          title: "Splitwise Token Missing",
          metadata: { action: args.action, enabled: true },
          output: `Splitwise token is not configured.

Set one of:
- zee.splitwise.token in agent-core.jsonc
- zee.splitwise.tokenFile in agent-core.jsonc
- SPLITWISE_TOKEN environment variable`,
        };
      }

      const requestResult = buildSplitwiseRequest({
        action: args.action,
        groupId: args.groupId,
        friendId: args.friendId,
        expenseId: args.expenseId,
        endpoint: args.endpoint,
        method: args.method,
        query: args.query as Record<string, SplitwiseValue> | undefined,
        payload: args.payload as Record<string, SplitwiseValue> | undefined,
        payloadFormat: args.payloadFormat,
        timeoutMs: args.timeoutMs,
      });

      if (requestResult.error || !requestResult.request) {
        return {
          title: "Splitwise Request Error",
          metadata: { action: args.action },
          output: requestResult.error || "Invalid Splitwise request.",
        };
      }

      try {
        const response = await callSplitwiseApi(requestResult.request, config);
        const output =
          typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data, null, 2);

        if (!response.ok) {
          return {
            title: `Splitwise Error (${response.status})`,
            metadata: {
              action: args.action,
              endpoint: requestResult.request.endpoint,
              status: response.status,
            },
            output: output || response.raw || "Splitwise request failed.",
          };
        }

        return {
          title: `Splitwise ${args.action}`,
          metadata: {
            action: args.action,
            endpoint: requestResult.request.endpoint,
            status: response.status,
          },
          output: output || "Splitwise request succeeded.",
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isTimeout = error instanceof Error && error.name === "AbortError";
        return {
          title: "Splitwise Request Failed",
          metadata: { action: args.action, error: errorMsg },
          output: isTimeout
            ? `Splitwise request timed out.`
            : `Splitwise request failed: ${errorMsg}`,
        };
      }
    },
  }),
};

// =============================================================================
// CodexBar Tool
// =============================================================================

const CodexbarParams = z.object({
  args: z.array(z.string()).default([]).describe("Arguments to pass to codexbar CLI"),
  timeoutMs: z.number().optional().describe("Override timeout in ms"),
});

export const codexbarTool: ToolDefinition = {
  id: "zee:codexbar",
  category: "domain",
  init: async () => ({
    description: `Run CodexBar CLI commands to check provider usage and resets.

Requires configuration:
- agent-core.jsonc: { "zee": { "codexbar": { "enabled": true } } }

Examples:
- Show status: { args: ["status"] }
- Cost usage: { args: ["cost", "--provider", "codex"] }`,
    parameters: CodexbarParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      ctx.metadata({ title: "CodexBar" });

      const config = resolveCodexbarConfig();
      if (!config.enabled) {
        return {
          title: "CodexBar Disabled",
          metadata: { enabled: false },
          output: `CodexBar tooling is disabled.

Enable it in agent-core.jsonc:
{
  "zee": {
    "codexbar": {
      "enabled": true
    }
  }
}`,
        };
      }

      if (config.error) {
        return {
          title: "CodexBar Configuration Error",
          metadata: { enabled: true },
          output: config.error,
        };
      }

      const result = runCodexbar(args.args, config, args.timeoutMs);
      const stdout = result.stdout.trim();
      const stderr = result.stderr.trim();
      const output = stdout || stderr;

      if (!result.ok) {
        return {
          title: "CodexBar Failed",
          metadata: { exitCode: result.status, error: result.error },
          output: result.error || output || "CodexBar command failed.",
        };
      }

      return {
        title: "CodexBar Output",
        metadata: { exitCode: result.status },
        output: output || "CodexBar command completed with no output.",
      };
    },
  }),
};

// =============================================================================
// WhatsApp Reaction Tool
// =============================================================================

const WhatsAppReactionParams = z.object({
  action: z.enum(["react"]).describe("Action to perform"),
  chatJid: z.string().describe("WhatsApp chat JID (e.g., '1234567890@c.us' for DM, 'groupId@g.us' for groups)"),
  messageId: z.string().describe("Message stanza ID to react to"),
  emoji: z.string().describe("Emoji character (e.g., '👍', '❤️', '😂'). Empty string to remove reaction."),
  remove: z.boolean().optional().describe("Set true to explicitly remove the reaction"),
});

export const whatsappReactionTool: ToolDefinition = {
  id: "zee:whatsapp-react",
  category: "domain",
  init: async () => ({
    description: `Add or remove emoji reactions to WhatsApp messages.

Use this to react to messages the user mentions or sends screenshots of.

Parameters:
- **chatJid**: The WhatsApp chat ID. Format depends on chat type:
  - DMs: "1234567890@c.us" (phone number + @c.us)
  - Groups: "123456789012345678@g.us" (group ID + @g.us)
- **messageId**: The message stanza ID to react to
- **emoji**: Unicode emoji character. Use empty string "" to remove.

Examples:
- Add thumbs up: { action: "react", chatJid: "1234567890@c.us", messageId: "ABC123", emoji: "👍" }
- Remove reaction: { action: "react", chatJid: "1234567890@c.us", messageId: "ABC123", emoji: "", remove: true }`,
    parameters: WhatsAppReactionParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { action, chatJid, messageId, emoji, remove } = args;

      ctx.metadata({ title: `WhatsApp: ${remove ? "Remove" : "Add"} reaction` });

      // Get daemon port from environment or default
      const daemonPort = process.env.AGENT_CORE_DAEMON_PORT || "3456";
      const baseUrl = `http://127.0.0.1:${daemonPort}`;

      try {
        // Note: This endpoint needs to be added to the server
        // For now, we'll use the existing sendMessage with a reaction-specific format
        // until a dedicated endpoint is added
        const response = await fetch(`${baseUrl}/gateway/whatsapp/react`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatJid, messageId, emoji: remove ? "" : emoji }),
        });

        if (!response.ok) {
          // Fallback: endpoint not implemented yet
          return {
            title: `WhatsApp Reaction (Not Implemented)`,
            metadata: { action, chatJid, messageId, emoji, remove },
            output: `WhatsApp reaction endpoint not yet available.

The reaction would be:
- Chat: ${chatJid}
- Message: ${messageId}
- Emoji: ${remove ? "(remove)" : emoji}

To enable reactions, add the /gateway/whatsapp/react endpoint to the daemon.`,
          };
        }

        const rawResult = await response.json();
        const parseResult = GatewayResponseSchema.safeParse(rawResult);

        if (!parseResult.success) {
          log.error("WhatsApp reaction response validation failed", {
            errors: parseResult.error.flatten().fieldErrors,
          });
          return {
            title: `WhatsApp Reaction Failed`,
            metadata: { action, chatJid, messageId, emoji, error: "Invalid response from gateway" },
            output: `Failed to ${remove ? "remove" : "add"} reaction: Invalid response from gateway`,
          };
        }

        const result = parseResult.data;

        if (!result.success) {
          return {
            title: `WhatsApp Reaction Failed`,
            metadata: { action, chatJid, messageId, emoji, error: result.error },
            output: `Failed to ${remove ? "remove" : "add"} reaction: ${result.error || "Unknown error"}`,
          };
        }

        return {
          title: `WhatsApp Reaction ${remove ? "Removed" : "Added"}`,
          metadata: { action, chatJid, messageId, emoji, success: true },
          output: remove
            ? `Removed reaction from message ${messageId.substring(0, 8)}...`
            : `Added ${emoji} reaction to message ${messageId.substring(0, 8)}...`,
        };

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Connection error likely means endpoint not implemented
        if (errorMsg.includes("ECONNREFUSED") || errorMsg.includes("fetch failed")) {
          return {
            title: `WhatsApp Reaction (Daemon Unavailable)`,
            metadata: { action, chatJid, messageId, emoji, error: errorMsg },
            output: `Could not connect to daemon to send reaction.

Ensure agent-core daemon is running with --whatsapp flag.

The reaction would be:
- Chat: ${chatJid}
- Message: ${messageId}
- Emoji: ${remove ? "(remove)" : emoji}`,
          };
        }

        return {
          title: `WhatsApp Reaction Error`,
          metadata: { action, chatJid, messageId, emoji, error: errorMsg },
          output: `Error sending reaction: ${errorMsg}`,
        };
      }
    },
  }),
};

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
  splitwiseTool,
  codexbarTool,
  whatsappReactionTool,
];

export function registerZeeTools(registry: { register: (tool: ToolDefinition, options: { source: string }) => void }): void {
  for (const tool of ZEE_TOOLS) {
    registry.register(tool, { source: "domain" });
  }
}

export { registerZeeTools as registerZeeDomainTools };
