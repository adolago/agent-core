/**
 * Zee Reminder Status Tool
 *
 * Checks calendar and memory for reminders and returns a status message
 * suitable for display in the TUI banner.
 */

import { z } from "zod";
import type { ToolDefinition, ToolExecutionResult } from "../../mcp/types.js";
import {
  getTodayEvents,
  checkCredentialsExist,
  type CalendarEvent,
} from "./google/calendar.js";
import { getMemory } from "../../memory/unified.js";

const ReminderStatusParams = z.object({
  format: z.enum(["short", "detailed"]).default("short")
    .describe("Status format: short (one line) or detailed (with next reminder)"),
});

interface ReminderInfo {
  type: "calendar" | "memory";
  title: string;
  time?: Date;
}

function getEventTime(event: CalendarEvent): Date | undefined {
  if (event.start.dateTime) {
    return new Date(event.start.dateTime);
  }
  if (event.start.date) {
    return new Date(event.start.date);
  }
  return undefined;
}

function formatTimeUntil(minutes: number): string {
  if (minutes < 1) return "now";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

export const reminderStatusTool: ToolDefinition = {
  id: "zee:reminder-status",
  category: "domain",
  init: async () => ({
    description: `Check reminder/calendar status and return a status message.

Returns a formatted status string suitable for display in the TUI banner.
Checks Google Calendar for today's events and memory for reminder entries.

Examples:
- Check status: { }
- Detailed format: { format: "detailed" }`,
    parameters: ReminderStatusParams,
    execute: async (args, ctx): Promise<ToolExecutionResult> => {
      const { format } = args;
      const now = new Date();
      const reminders: ReminderInfo[] = [];
      let calendarError: string | null = null;

      // Check Google Calendar for today's events
      const hasCredentials = await checkCredentialsExist();
      if (hasCredentials) {
        try {
          const events = await getTodayEvents();
          for (const event of events) {
            const eventTime = getEventTime(event);
            // Only include future or ongoing events
            if (eventTime && eventTime.getTime() >= now.getTime() - 60 * 60 * 1000) {
              reminders.push({
                type: "calendar",
                title: event.summary || "(No title)",
                time: eventTime,
              });
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (errorMsg.includes("401") || errorMsg.includes("invalid_grant")) {
            calendarError = "calendar auth error";
          } else {
            calendarError = "calendar unavailable";
          }
        }
      }

      // Check memory for reminder entries
      try {
        const store = getMemory();
        const memoryResults = await store.search({
          query: "reminder task due today upcoming",
          limit: 10,
          threshold: 0.5,
          category: "task",
        });

        for (const result of memoryResults) {
          const content = result.entry.content.toLowerCase();
          // Look for time indicators in memory content
          const hasTimeIndicator = /\b(today|tomorrow|at \d|due|by \d|in \d+ (min|hour))\b/.test(content);

          if (hasTimeIndicator) {
            reminders.push({
              type: "memory",
              title: result.entry.content.split("\n")[0].slice(0, 50),
            });
          }
        }
      } catch (error) {
        // Memory errors are non-fatal, just don't include memory reminders
      }

      // Sort reminders by time (events with no time go last)
      reminders.sort((a, b) => {
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.getTime() - b.time.getTime();
      });

      // Format the status message
      let statusMessage: string;

      if (reminders.length === 0) {
        if (calendarError) {
          statusMessage = `Zee is online. ${calendarError}.`;
        } else {
          statusMessage = "Zee is online. No active reminders.";
        }
      } else {
        const upcomingReminders = reminders.filter(r => {
          if (!r.time) return true;
          return r.time.getTime() >= now.getTime();
        });

        if (format === "detailed" && upcomingReminders.length > 0) {
          const next = upcomingReminders[0];
          if (next.time) {
            const minutesUntil = (next.time.getTime() - now.getTime()) / (1000 * 60);
            const timeStr = formatTimeUntil(minutesUntil);
            statusMessage = `Zee is online. Next: ${next.title} in ${timeStr}.`;
          } else {
            statusMessage = `Zee is online. Next: ${next.title}.`;
          }
        } else {
          const count = reminders.length;
          statusMessage = `Zee is online. ${count} reminder${count !== 1 ? "s" : ""} today.`;
        }
      }

      return {
        title: "Reminder Status",
        metadata: {
          reminderCount: reminders.length,
          format,
          calendarError: calendarError ?? undefined,
        },
        output: statusMessage,
      };
    },
  }),
};
