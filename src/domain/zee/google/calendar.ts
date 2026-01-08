/**
 * Google Calendar Client for Zee
 *
 * Uses OAuth2 tokens from ~/.zee/credentials/google/ to fetch calendar events.
 */

import { readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

const CREDENTIALS_DIR = join(homedir(), ".zee", "credentials", "google");
const OAUTH_CLIENT_PATH = join(CREDENTIALS_DIR, "oauth-client.json");
const TOKENS_PATH = join(CREDENTIALS_DIR, "tokens.json");

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

interface OAuthClient {
  installed: {
    client_id: string;
    client_secret: string;
    token_uri: string;
  };
}

interface Tokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope: string;
}

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  status: string;
  htmlLink?: string;
}

interface CalendarList {
  items: Array<{
    id: string;
    summary: string;
    primary?: boolean;
    backgroundColor?: string;
  }>;
}

interface EventsResponse {
  items: CalendarEvent[];
  nextPageToken?: string;
  summary?: string;
}

export interface FormattedEvent {
  id: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
  isAllDay: boolean;
}

async function loadCredentials(): Promise<{ client: OAuthClient; tokens: Tokens }> {
  const [clientJson, tokensJson] = await Promise.all([
    readFile(OAUTH_CLIENT_PATH, "utf-8"),
    readFile(TOKENS_PATH, "utf-8"),
  ]);
  return {
    client: JSON.parse(clientJson) as OAuthClient,
    tokens: JSON.parse(tokensJson) as Tokens,
  };
}

async function saveTokens(tokens: Tokens): Promise<void> {
  await writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2));
}

async function refreshAccessToken(client: OAuthClient, tokens: Tokens): Promise<Tokens> {
  const response = await fetch(client.installed.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.installed.client_id,
      client_secret: client.installed.client_secret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const newTokenData = await response.json() as Record<string, unknown>;
  const updatedTokens: Tokens = {
    ...tokens,
    access_token: newTokenData.access_token as string,
    expiry_date: Date.now() + ((newTokenData.expires_in as number) || 3600) * 1000,
  };

  await saveTokens(updatedTokens);
  return updatedTokens;
}

async function getValidToken(): Promise<string> {
  const { client, tokens } = await loadCredentials();

  // Refresh if expired or expiring within 5 minutes
  if (Date.now() > tokens.expiry_date - 5 * 60 * 1000) {
    const refreshed = await refreshAccessToken(client, tokens);
    return refreshed.access_token;
  }

  return tokens.access_token;
}

async function calendarRequest<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const token = await getValidToken();
  const url = new URL(`${CALENDAR_API_BASE}${endpoint}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Calendar API error (${response.status}): ${error}`);
  }

  return response.json() as T;
}

export async function listCalendars(): Promise<CalendarList["items"]> {
  const result = await calendarRequest<CalendarList>("/users/me/calendarList");
  return result.items;
}

export async function listEvents(
  calendarId: string = "primary",
  options: {
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    singleEvents?: boolean;
    orderBy?: "startTime" | "updated";
  } = {}
): Promise<CalendarEvent[]> {
  const params: Record<string, string> = {
    singleEvents: String(options.singleEvents ?? true),
    orderBy: options.orderBy ?? "startTime",
    maxResults: String(options.maxResults ?? 50),
  };

  if (options.timeMin) params.timeMin = options.timeMin;
  if (options.timeMax) params.timeMax = options.timeMax;

  const result = await calendarRequest<EventsResponse>(
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    params
  );
  return result.items || [];
}

export async function getTodayEvents(calendarId: string = "primary"): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  return listEvents(calendarId, {
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
  });
}

export async function getWeekEvents(calendarId: string = "primary"): Promise<CalendarEvent[]> {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Start from Sunday
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  return listEvents(calendarId, {
    timeMin: startOfWeek.toISOString(),
    timeMax: endOfWeek.toISOString(),
  });
}

export async function getMonthEvents(
  calendarId: string = "primary",
  year?: number,
  month?: number
): Promise<CalendarEvent[]> {
  const now = new Date();
  const targetYear = year ?? now.getFullYear();
  const targetMonth = month ?? now.getMonth();

  const startOfMonth = new Date(targetYear, targetMonth, 1);
  const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);

  return listEvents(calendarId, {
    timeMin: startOfMonth.toISOString(),
    timeMax: endOfMonth.toISOString(),
  });
}

export function formatEventsForCanvas(events: CalendarEvent[]): FormattedEvent[] {
  return events.map((event) => {
    const startDateTime = event.start.dateTime || event.start.date;
    const endDateTime = event.end.dateTime || event.end.date;
    const isAllDay = !event.start.dateTime;

    let date = "";
    let startTime: string | undefined;
    let endTime: string | undefined;

    if (startDateTime) {
      const startDate = new Date(startDateTime);
      date = startDate.toISOString().split("T")[0];

      if (!isAllDay) {
        startTime = startDate.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        if (endDateTime) {
          const endDate = new Date(endDateTime);
          endTime = endDate.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });
        }
      }
    }

    return {
      id: event.id,
      title: event.summary || "(No title)",
      date,
      startTime,
      endTime,
      location: event.location,
      description: event.description,
      isAllDay,
    };
  });
}

export async function checkCredentialsExist(): Promise<boolean> {
  try {
    await Promise.all([
      readFile(OAUTH_CLIENT_PATH),
      readFile(TOKENS_PATH),
    ]);
    return true;
  } catch {
    return false;
  }
}
