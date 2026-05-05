/**
 * Smart Scan — Proactive Intelligence Engine (PIE) core
 *
 * Cross-references the user's recent emails and upcoming calendar events with
 * Claude Sonnet to surface gaps: events not on the calendar, purchases not
 * placed, travel not booked, replies overdue, deadlines missed.
 *
 * Uses raw fetch (not @anthropic-ai/sdk) for parity with src/services/ai.ts —
 * the rest of the app is on the no-extra-dep path and the SDK would require
 * a fresh EAS build to verify it links cleanly on iOS.
 */

import type { SmartSuggestion, SuggestionAction, SuggestionType } from '../types';
import type { RawEmail } from './gmail';
import type { CalendarEvent } from './calendar';
import { stableHash } from './utils';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are an ADHD executive function assistant analyzing a person's emails and calendar events together.

Your job: find things they probably haven't noticed or haven't dealt with. Look for:
- Events mentioned in emails that are NOT on their calendar
- Purchases they mentioned needing but haven't made (no order confirmation found)
- Travel (flights, hotels) that is referenced but not confirmed via a booking email
- Emails that clearly need a reply and haven't gotten one in several days
- Past-due items or deadlines that appear to have been missed

You are looking for GAPS. Do not flag things that are clearly already handled (existing calendar events, confirmed orders, replied threads).

Be specific. If you identify a purchase, name the exact product. If an event is missing from the calendar, include the exact date and time from the email. If travel needs booking, include the destination and travel dates.

Return ONLY a valid JSON array. Return [] if nothing is clearly actionable. Never return more than 8 suggestions. Do not invent things not clearly implied by the data.`;

const VALID_TYPES: SuggestionType[] = [
  'add_to_calendar',
  'purchase',
  'book_travel',
  'reply_needed',
  'overdue_task',
  'follow_up',
];

const VALID_ACTION_TYPES = [
  'calendar',
  'amazon',
  'flights',
  'draft_reply',
  'task',
  'none',
] as const;

type RawSuggestion = {
  type?: string;
  title?: string;
  context?: string;
  urgency?: string;
  action?: { type?: string; [k: string]: unknown };
  sourceEmailId?: string | null;
};

/**
 * Cross-reference emails + calendar events with Claude. Returns a list of
 * fresh, pending SmartSuggestion records. Returns [] on any error so callers
 * (background task, foreground refresh) can keep going.
 */
export async function scanForSuggestions(
  emails: RawEmail[],
  calendarEvents: CalendarEvent[],
  userEmail: string,
  anthropicKey: string
): Promise<SmartSuggestion[]> {
  if (!anthropicKey) return [];
  if (emails.length === 0 && calendarEvents.length === 0) return [];

  const now = new Date().toISOString();
  const userPrompt = `Current date/time: ${now}
User email: ${userEmail}

CALENDAR EVENTS (next 30 days):
${JSON.stringify(calendarEvents.slice(0, 30), null, 2)}

RECENT EMAILS (last 7 days):
${JSON.stringify(
    emails.slice(0, 30).map((e) => ({
      id: e.id,
      from: e.from,
      subject: e.subject,
      snippet: e.snippet,
      receivedAt: e.receivedAt,
      // First 500 chars of body for context without blowing the token budget
      bodyPreview: e.body?.slice(0, 500) ?? '',
    })),
    null,
    2
  )}

Return a JSON array of smart suggestions using this schema for each item:
{
  "type": "add_to_calendar" | "purchase" | "book_travel" | "reply_needed" | "overdue_task" | "follow_up",
  "title": "Short imperative title, under 10 words",
  "context": "One sentence: why this matters and where you saw it",
  "urgency": "high" | "medium" | "low",
  "action": {
    "type": "calendar" | "amazon" | "flights" | "draft_reply" | "task" | "none",
    // For calendar: include "event": { "title", "date" (ISO 8601 or null), "durationMinutes", "notes" }
    // For amazon: include "searchQuery" (specific product search string) and "productDescription"
    // For flights: include "destination", "departureDateISO" (or null), "returnDateISO" (or null)
    // For draft_reply: include "emailId", "subject", "draftBody" (complete ready-to-send reply)
    // For task: include "taskTitle" and optionally "notes"
    // For none: no additional fields
  },
  "sourceEmailId": "Gmail message ID if from an email, or null"
}

Return ONLY the JSON array. No prose, no markdown fences.`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.warn(`[SmartScan] Claude API error ${response.status}: ${err}`);
      return [];
    }

    const data = await response.json();
    const raw: string = data.content?.[0]?.text ?? '';
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.warn('[SmartScan] Failed to parse JSON:', e, '\nRaw:', cleaned.slice(0, 400));
      return [];
    }

    if (!Array.isArray(parsed)) {
      console.warn('[SmartScan] Expected array, got:', typeof parsed);
      return [];
    }

    return (parsed as RawSuggestion[])
      .map((item) => normalizeSuggestion(item))
      .filter((s): s is SmartSuggestion => s !== null);
  } catch (e) {
    console.warn('[SmartScan] Failed:', e);
    return [];
  }
}

function normalizeSuggestion(item: RawSuggestion): SmartSuggestion | null {
  if (!item || typeof item !== 'object') return null;
  if (!item.title || !item.context) return null;

  const type = VALID_TYPES.includes(item.type as SuggestionType)
    ? (item.type as SuggestionType)
    : 'follow_up';

  const urgency: 'high' | 'medium' | 'low' =
    item.urgency === 'high' || item.urgency === 'medium' || item.urgency === 'low'
      ? item.urgency
      : 'medium';

  const action = normalizeAction(item.action);
  if (!action) return null;

  const title = String(item.title).slice(0, 120);
  const context = String(item.context).slice(0, 240);
  const sourceEmailId = item.sourceEmailId ?? null;

  // Bug B (device-testing iteration 2): ids must be deterministic so the
  // same logical scan result collapses across runs. Using nanoid here
  // meant every 15-minute background scan minted a new id for the same
  // content, and setSuggestions' merge-by-id silently appended.
  // No 'smart-' prefix — that namespace belongs to ActionCard.id; the
  // SmartSuggestion lives in a typed array of its own.
  return {
    id: stableHash(suggestionDedupKey(type, title, sourceEmailId)),
    type,
    title,
    context,
    urgency,
    action,
    sourceEmailId,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
}

/**
 * Stronger dedup key than the original (type + title) — adds sourceEmailId
 * so two unrelated suggestions that happen to share a generic title still
 * get distinct ids. Internal helper used by both id-minting and the
 * background merge step.
 */
function suggestionDedupKey(
  type: string,
  title: string,
  sourceEmailId: string | null | undefined
): string {
  const norm = title.toLowerCase().replace(/\s+/g, ' ').trim();
  return `${type}|${norm}|${sourceEmailId ?? ''}`;
}

function normalizeAction(raw: unknown): SuggestionAction | null {
  if (!raw || typeof raw !== 'object') return { type: 'none' };
  const a = raw as Record<string, any>;
  const t = a.type;
  if (!VALID_ACTION_TYPES.includes(t)) return { type: 'none' };

  switch (t) {
    case 'calendar': {
      const evt = a.event ?? {};
      if (!evt.title) return { type: 'none' };
      return {
        type: 'calendar',
        event: {
          title: String(evt.title),
          date: evt.date ?? null,
          durationMinutes: Number(evt.durationMinutes ?? evt.duration_minutes ?? 60) || 60,
          notes: evt.notes ?? undefined,
        },
      };
    }
    case 'amazon': {
      if (!a.searchQuery) return null;
      return {
        type: 'amazon',
        searchQuery: String(a.searchQuery),
        productDescription: String(a.productDescription ?? a.searchQuery),
      };
    }
    case 'flights': {
      if (!a.destination) return null;
      return {
        type: 'flights',
        destination: String(a.destination),
        departureDateISO: a.departureDateISO ?? null,
        returnDateISO: a.returnDateISO ?? null,
      };
    }
    case 'draft_reply': {
      if (!a.draftBody) return null;
      return {
        type: 'draft_reply',
        emailId: String(a.emailId ?? ''),
        subject: String(a.subject ?? ''),
        draftBody: String(a.draftBody),
      };
    }
    case 'task': {
      if (!a.taskTitle) return null;
      return {
        type: 'task',
        taskTitle: String(a.taskTitle),
        notes: a.notes ?? undefined,
      };
    }
    case 'none':
    default:
      return { type: 'none' };
  }
}

/**
 * Dedup helper used by the background merge step. Now derives from the
 * same content key as the id minting (stable across runs, includes
 * sourceEmailId for disambiguation).
 */
export function dedupKey(
  s: Pick<SmartSuggestion, 'type' | 'title' | 'sourceEmailId'>
): string {
  return suggestionDedupKey(s.type, s.title, s.sourceEmailId);
}
