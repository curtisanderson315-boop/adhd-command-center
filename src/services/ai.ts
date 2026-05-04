/**
 * AI Engine — ADHD Command Center
 *
 * Uses Anthropic Claude API (claude-sonnet for voice, claude-haiku for email triage).
 *
 * Two entry points:
 *   processVoiceInput(text)   → CapturedAction[]
 *   triageEmail(email)        → TriagedEmail (with AI fields filled in)
 */

import { format } from 'date-fns';
import type { CapturedAction, TriagedEmail, TriageSuggestedAction } from '../types';
import { nanoid } from './utils';

// ─── Config ──────────────────────────────────────────────────────────────────

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const VOICE_MODEL   = 'claude-sonnet-4-6';         // high quality for voice capture
const TRIAGE_MODEL  = 'claude-haiku-4-5-20251001'; // fast + cheap for email triage

// ─── System prompts ───────────────────────────────────────────────────────────

const VOICE_SYSTEM_PROMPT = `You are the executive function AI for someone with ADHD. Your job is to take raw,
unfiltered voice input and transform it into a structured action.

The user speaks naturally — they may ramble, be incomplete, jump topics, or not
know exactly what they want. Your job is to figure out their intent and structure it.

RULES:
- Always respond with a valid JSON object — no markdown fences, no explanation, just raw JSON
- If the input contains multiple distinct items, return an array of action objects
- Prefer calendar over tasks when a specific date/time is mentioned
- Prefer email draft over tasks when a person's name + communication intent is present
- When date/time is ambiguous (e.g. "soon", "later"), default to TASK, not calendar
- Never make up details. If something is unclear, flag it in the "needs_clarification" field
- Speak to the user in the second person in the "confirmation_text" field
- Keep confirmation_text short (under 15 words) — it will be read aloud by Siri

OUTPUT FORMAT — respond ONLY with this JSON, no extra text:
{
  "actions": [
    {
      "type": "calendar_event" | "gmail_draft" | "task" | "note",
      "title": "Short title for the item",
      "body": "Full content / email body if applicable, or null",
      "date": "ISO 8601 datetime string, or null",
      "duration_minutes": number or null,
      "recipient_name": "Name of email recipient, or null",
      "recipient_email": "Email if known, or null",
      "priority": "high" | "medium" | "low",
      "needs_clarification": "Short question if something is missing, or null",
      "confirmation_text": "Short spoken confirmation for Siri to read back"
    }
  ]
}`;

const TRIAGE_SYSTEM_PROMPT = `You are an ADHD email assistant. Your job is to read an incoming email and tell the
user exactly what it is, why it matters (or doesn't), and what they should do about it.

The user has ADHD. They need:
- Ruthless brevity — no fluff, no restating what the email says
- Actionability — what do they actually need to DO, if anything?
- Low cognitive load — they should be able to decide in 3 seconds

RULES:
- Always respond with valid JSON only — no markdown fences, no explanation, just raw JSON
- The summary must be one sentence, under 20 words
- Actions must be concrete and specific (not "consider replying")
- If an email requires no action, say so clearly — don't manufacture tasks
- Draft replies should be complete and ready to send with minimal editing
- Provide 2-3 suggested actions maximum
- Urgency must be honest — do NOT mark everything as urgent

PRIORITY LEVELS:
- "urgent" = requires action TODAY or has a deadline within 48 hours
- "action_needed" = requires a response or follow-up, no immediate deadline
- "fyi" = informational, no reply or action needed
- "noise" = newsletter, promo, notification — safe to archive

OUTPUT FORMAT — respond ONLY with this JSON, no extra text:
{
  "summary": "One-sentence plain-English summary under 20 words",
  "priority": "urgent" | "action_needed" | "fyi" | "noise",
  "priority_reason": "One short phrase explaining why",
  "suggested_actions": [
    {
      "action_type": "reply" | "calendar_event" | "task" | "archive" | "snooze",
      "label": "Short button label (max 5 words)",
      "draft_body": "Full reply text if action_type is reply, otherwise null",
      "calendar_event": { "title": "...", "date": "ISO 8601 or null", "duration_minutes": 60 } or null,
      "task_text": "Task description or null",
      "snooze_until": "ISO 8601 or null"
    }
  ]
}`;

// ─── Core fetch helper ────────────────────────────────────────────────────────

async function callClaude(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  model: string
): Promise<string> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text: string = data.content[0].text;

  // Strip any accidental markdown fences if Claude adds them
  return text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
}

// ─── Voice input processing ───────────────────────────────────────────────────

export async function processVoiceInput(
  transcript: string,
  apiKey: string
): Promise<CapturedAction[]> {
  const now = new Date();
  const userMessage = `Current date/time: ${format(now, "EEEE, MMMM d yyyy 'at' h:mm a")} (${Intl.DateTimeFormat().resolvedOptions().timeZone})

User said: "${transcript}"`;

  const raw = await callClaude(VOICE_SYSTEM_PROMPT, userMessage, apiKey, VOICE_MODEL);
  const parsed = JSON.parse(raw);
  const actions = parsed.actions ?? [parsed];

  return actions.map((a: any): CapturedAction => ({
    id: nanoid(),
    type: a.type,
    title: a.title,
    body: a.body ?? null,
    date: a.date ?? null,
    durationMinutes: a.duration_minutes ?? null,
    recipientName: a.recipient_name ?? null,
    recipientEmail: a.recipient_email ?? null,
    priority: a.priority ?? 'medium',
    needsClarification: a.needs_clarification ?? null,
    confirmationText: a.confirmation_text ?? 'Got it.',
    createdAt: now.toISOString(),
    routedTo: null,
    status: 'pending',
  }));
}

// ─── Audio transcription ─────────────────────────────────────────────────────
//
// The Anthropic Claude API does not currently accept audio inputs. We expose a
// transcription entry point anyway so the UI can attempt it and fall back to the
// keyboard text-input flow when it returns null. When/if Claude (or a sidecar
// service the user configures) gains audio support, this is the single seam to
// upgrade — UI does not need to change.
//
// Returns the transcript text, or null when transcription is unavailable.

export async function transcribeAudio(
  _audioUri: string,
  _apiKey: string
): Promise<string | null> {
  // TODO: BLOCKED — Anthropic API has no audio endpoint. Wire OpenAI Whisper
  // or native iOS SFSpeechRecognizer here when the user is ready to add it.
  return null;
}

// ─── Email triage ─────────────────────────────────────────────────────────────

export async function triageEmail(
  email: {
    id: string;
    threadId: string;
    from: string;
    subject: string;
    body: string;
    snippet: string;
    receivedAt: string;
  },
  apiKey: string
): Promise<TriagedEmail> {
  const now = new Date();
  const userMessage = `Current date/time: ${format(now, "EEEE, MMMM d yyyy 'at' h:mm a")}

FROM: ${email.from}
SUBJECT: ${email.subject}
RECEIVED: ${email.receivedAt}

BODY:
${email.body.slice(0, 3000)}`; // cap body to avoid token explosion

  const raw = await callClaude(TRIAGE_SYSTEM_PROMPT, userMessage, apiKey, TRIAGE_MODEL);
  const parsed = JSON.parse(raw);

  const suggestedActions: TriageSuggestedAction[] = (
    parsed.suggested_actions ?? []
  ).map((a: any): TriageSuggestedAction => ({
    actionType: a.action_type,
    label: a.label,
    draftBody: a.draft_body ?? null,
    calendarEvent: a.calendar_event ?? null,
    taskText: a.task_text ?? null,
    snoozeUntil: a.snooze_until ?? null,
  }));

  return {
    id: email.id,
    threadId: email.threadId,
    from: email.from,
    subject: email.subject,
    snippet: email.snippet,
    receivedAt: email.receivedAt,
    summary: parsed.summary ?? email.snippet,
    priority: parsed.priority ?? 'fyi',
    priorityReason: parsed.priority_reason ?? '',
    suggestedActions,
    status: 'pending',
  };
}
