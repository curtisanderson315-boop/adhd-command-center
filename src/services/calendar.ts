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
  title: string;
  start: string;
  end: string;
  description?: string;
}

export async function getUpcomingEvents(
  maxResults = 10,
  calendarId = 'primary'
): Promise<CalendarEvent[]> {
  const now = new Date().toISOString();
  const data = await calFetch(
    `/calendars/${calendarId}/events?timeMin=${now}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`
  );

  return (data.items ?? []).map((e: any): CalendarEvent => ({
    id: e.id,
    title: e.summary ?? '(no title)',
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '',
    description: e.description,
  }));
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
