/**
 * Google Calendar API service — ADHD Command Center
 */

import { getValidAccessToken } from './auth';

const CAL_BASE = 'https://www.googleapis.com/calendar/v3';

async function calFetch(path: string, options: RequestInit = {}) {
  const token = await getValidAccessToken();
  const res = await fetch(`${CAL_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Calendar API error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Create event ─────────────────────────────────────────────────────────────

export interface CreateEventParams {
  title: string;
  startDate: Date;
  durationMinutes: number;
  notes?: string | null;
  calendarId?: string; // defaults to 'primary'
}

export interface CreatedEvent {
  eventId: string;
  htmlLink: string;
  title: string;
  start: string;
  end: string;
}

export async function createEvent({
  title,
  startDate,
  durationMinutes,
  notes,
  calendarId = 'primary',
}: CreateEventParams): Promise<CreatedEvent> {
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const body = {
    summary: title,
    description: notes ?? undefined,
    start: {
      dateTime: startDate.toISOString(),
      timeZone: tz,
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: tz,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 15 },
        { method: 'popup', minutes: 60 },
      ],
    },
  };

  const data = await calFetch(`/calendars/${calendarId}/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return {
    eventId: data.id,
    htmlLink: data.htmlLink,
    title: data.summary,
    start: data.start.dateTime,
    end: data.end.dateTime,
  };
}

// ─── List upcoming events ─────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  summary: string;
  startDateTime: string;   // ISO 8601
  endDateTime: string;     // ISO 8601
  location?: string | null;
  description?: string | null;
}

/**
 * Fetch upcoming events from the user's primary Google Calendar.
 * Returns [] on failure rather than throwing — used by the smart-scan path
 * which must remain fault-tolerant.
 */
export async function fetchUpcomingEvents(
  daysAhead = 30,
  calendarId = 'primary'
): Promise<CalendarEvent[]> {
  try {
    const now = new Date();
    const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const params = new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: future.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '50',
    });
    const data = await calFetch(`/calendars/${calendarId}/events?${params.toString()}`);

    return (data.items ?? []).map((e: any): CalendarEvent => ({
      id: e.id,
      summary: e.summary ?? '(no title)',
      startDateTime: e.start?.dateTime ?? e.start?.date ?? '',
      endDateTime: e.end?.dateTime ?? e.end?.date ?? '',
      location: e.location ?? null,
      description: e.description ?? null,
    }));
  } catch (e) {
    console.warn('[Calendar] fetchUpcomingEvents failed:', e);
    return [];
  }
}

// ─── Delete event ─────────────────────────────────────────────────────────────

export async function deleteEvent(
  eventId: string,
  calendarId = 'primary'
): Promise<void> {
  const token = await getValidAccessToken();
  await fetch(`${CAL_BASE}/calendars/${calendarId}/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}
