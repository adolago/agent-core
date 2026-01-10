#!/usr/bin/env node
/**
 * Calendar MCP Server
 *
 * Exposes Zee's Google Calendar integration via MCP protocol:
 * - calendar_events: List events for a time range
 * - calendar_create: Create a new event
 * - calendar_update: Update an existing event
 * - calendar_delete: Delete an event
 * - calendar_free_slots: Find free time slots
 * - calendar_quick_add: Quick add event using natural language
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getTodayEvents,
  getWeekEvents,
  getMonthEvents,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  findFreeSlots,
  quickAddEvent,
  checkCredentialsExist,
} from "../../domain/zee/google/calendar.js";

// Create server
const server = new McpServer({
  name: "personas-calendar",
  version: "1.0.0",
});

// =============================================================================
// calendar_events - List events for a time range
// =============================================================================

server.tool(
  "calendar_events",
  `List calendar events for a specified time range.

Supports preset ranges (today, week, month) or custom date ranges.
Events include title, time, location, attendees, and meeting links.`,
  {
    range: z.enum(["today", "week", "month", "custom"]).default("today").describe("Time range preset"),
    startDate: z.string().optional().describe("Start date (ISO format) for custom range"),
    endDate: z.string().optional().describe("End date (ISO format) for custom range"),
    maxResults: z.number().default(50).describe("Maximum events to return"),
  },
  async (args) => {
    const { range, startDate, endDate, maxResults } = args;

    try {
      const hasCredentials = await checkCredentialsExist();
      if (!hasCredentials) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Google Calendar credentials not configured. Run 'agent-core auth login google' first.",
            }),
          }],
          isError: true,
        };
      }

      let events;
      const selectedRange = range ?? "today";

      if (selectedRange === "today") {
        events = await getTodayEvents();
      } else if (selectedRange === "week") {
        events = await getWeekEvents();
      } else if (selectedRange === "month") {
        events = await getMonthEvents();
      } else if (selectedRange === "custom" && startDate && endDate) {
        events = await listEvents("primary", {
          timeMin: startDate,
          timeMax: endDate,
          maxResults: maxResults ?? 50,
        });
      } else {
        events = await getTodayEvents();
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            range: selectedRange,
            count: events.length,
            events: events.map((e) => ({
              id: e.id,
              title: e.summary,
              start: e.start.dateTime || e.start.date,
              end: e.end.dateTime || e.end.date,
              location: e.location,
              description: e.description?.substring(0, 200),
              attendees: e.attendees?.map((a) => a.email),
              isAllDay: !e.start.dateTime,
              htmlLink: e.htmlLink,
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// calendar_create - Create a new event
// =============================================================================

server.tool(
  "calendar_create",
  `Create a new calendar event.

Supports timed or all-day events, location, description, and attendees.`,
  {
    title: z.string().describe("Event title"),
    start: z.string().describe("Start time (ISO format for timed event, YYYY-MM-DD for all-day)"),
    end: z.string().describe("End time (ISO format for timed event, YYYY-MM-DD for all-day)"),
    description: z.string().optional().describe("Event description"),
    location: z.string().optional().describe("Event location"),
    attendees: z.array(z.string()).optional().describe("Attendee email addresses"),
    allDay: z.boolean().default(false).describe("Create all-day event"),
  },
  async (args) => {
    const { title, start, end, description, location, attendees, allDay } = args;

    try {
      const hasCredentials = await checkCredentialsExist();
      if (!hasCredentials) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Google Calendar credentials not configured.",
            }),
          }],
          isError: true,
        };
      }

      const eventInput = {
        summary: title,
        description,
        location,
        start: allDay ? { date: start } : { dateTime: start },
        end: allDay ? { date: end } : { dateTime: end },
        attendees: attendees?.map((email) => ({ email })),
      };

      const event = await createEvent("primary", eventInput);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            message: `Event "${title}" created`,
            event: {
              id: event.id,
              title: event.summary,
              start: event.start.dateTime || event.start.date,
              end: event.end.dateTime || event.end.date,
              location: event.location,
              htmlLink: event.htmlLink,
            },
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// calendar_update - Update an existing event
// =============================================================================

server.tool(
  "calendar_update",
  `Update an existing calendar event by ID. Only provided fields will be updated.`,
  {
    eventId: z.string().describe("Event ID to update"),
    title: z.string().optional().describe("New title"),
    start: z.string().optional().describe("New start time (ISO format)"),
    end: z.string().optional().describe("New end time (ISO format)"),
    description: z.string().optional().describe("New description"),
    location: z.string().optional().describe("New location"),
  },
  async (args) => {
    const { eventId, title, start, end, description, location } = args;

    try {
      const hasCredentials = await checkCredentialsExist();
      if (!hasCredentials) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Google Calendar credentials not configured.",
            }),
          }],
          isError: true,
        };
      }

      const updates: Record<string, unknown> = {};
      if (title) updates.summary = title;
      if (start) updates.start = { dateTime: start };
      if (end) updates.end = { dateTime: end };
      if (description) updates.description = description;
      if (location) updates.location = location;

      const event = await updateEvent("primary", eventId, updates);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            message: `Event updated`,
            event: {
              id: event.id,
              title: event.summary,
              start: event.start.dateTime || event.start.date,
              end: event.end.dateTime || event.end.date,
            },
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// calendar_delete - Delete an event
// =============================================================================

server.tool(
  "calendar_delete",
  `Delete a calendar event by ID.`,
  {
    eventId: z.string().describe("Event ID to delete"),
  },
  async (args) => {
    const { eventId } = args;

    try {
      const hasCredentials = await checkCredentialsExist();
      if (!hasCredentials) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Google Calendar credentials not configured.",
            }),
          }],
          isError: true,
        };
      }

      await deleteEvent("primary", eventId);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            message: `Event ${eventId} deleted`,
          }),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// calendar_free_slots - Find free time slots
// =============================================================================

server.tool(
  "calendar_free_slots",
  `Find available time slots in the calendar. Respects business hours and existing events.`,
  {
    startDate: z.string().describe("Start of search range (ISO format)"),
    endDate: z.string().describe("End of search range (ISO format)"),
    durationMinutes: z.number().default(30).describe("Required slot duration in minutes"),
    startHour: z.number().default(9).describe("Business hours start (0-23)"),
    endHour: z.number().default(17).describe("Business hours end (0-23)"),
  },
  async (args) => {
    const { startDate, endDate, durationMinutes, startHour, endHour } = args;

    try {
      const hasCredentials = await checkCredentialsExist();
      if (!hasCredentials) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Google Calendar credentials not configured.",
            }),
          }],
          isError: true,
        };
      }

      const slots = await findFreeSlots("primary", {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        minDurationMinutes: durationMinutes ?? 30,
        preferences: {
          businessHoursStart: startHour ?? 9,
          businessHoursEnd: endHour ?? 17,
        },
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            count: slots.length,
            slots: slots.map((s) => ({
              start: s.start.toISOString(),
              end: s.end.toISOString(),
              durationMinutes: s.durationMinutes,
            })),
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// calendar_quick_add - Quick add event using natural language
// =============================================================================

server.tool(
  "calendar_quick_add",
  `Create an event using natural language. Example: "Meeting with John tomorrow at 2pm for 1 hour"`,
  {
    text: z.string().describe("Natural language event description"),
  },
  async (args) => {
    const { text } = args;

    try {
      const hasCredentials = await checkCredentialsExist();
      if (!hasCredentials) {
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: "Google Calendar credentials not configured.",
            }),
          }],
          isError: true,
        };
      }

      const event = await quickAddEvent("primary", text);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            message: `Event created from: "${text}"`,
            event: {
              id: event.id,
              title: event.summary,
              start: event.start.dateTime || event.start.date,
              end: event.end.dateTime || event.end.date,
              htmlLink: event.htmlLink,
            },
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        }],
        isError: true,
      };
    }
  }
);

// =============================================================================
// Start server
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Calendar MCP server running on stdio");
}

main().catch((error) => {
  console.error("Failed to start Calendar MCP server:", error);
  process.exit(1);
});
