/**
 * Context Miner — Memory-Augmented Action engine.
 *
 * The killer feature in v2. When Curtis says "I need to buy a replacement
 * piece for the trashcan, I bought it before, there's a receipt in my email"
 * we don't create a generic task. We mine his Gmail history, extract the
 * product (ASIN if visible), and synthesize an ActionCard whose primary
 * action is a one-tap deep link straight to the Amazon product page.
 *
 * Two phases of lookup:
 *   1. Local PurchaseRecord index (fast, populated by Phase F's receipt
 *      indexer). Phase F adds an `findInPurchaseIndex(...)` consult here.
 *   2. Live Gmail search via the cached recent inbox (this file today).
 */

import type { ActionCard, ActionPayload, PurchaseRecord } from '../types';
import { nanoid } from './utils';
import { findInPurchaseIndex } from './receiptIndex';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = 'claude-sonnet-4-6';

// ─── Trigger detection ──────────────────────────────────────────────────────

/**
 * The trigger-phrase list from the v2 spec. Any of these in the transcript
 * means "the user is referencing prior context that probably lives in their
 * email." If matched, we route to the contextMiner; if not, we fall through
 * to the legacy CapturedAction flow.
 */
const CONTEXT_HINT_PATTERNS: RegExp[] = [
  /\b(again|reorder|re-order|repurchase)\b/i,
  /\b(bought|ordered|got|grabbed) (it|that|one|those|them|some)\b/i,
  /\b(like|same as|just like) last (time|month|week|year)\b/i,
  /\bthat (thing|one|email|order|recruiter|guy|girl|person|appointment|doctor|dentist)\b/i,
  /\bthe (receipt|email|order|recruiter|dentist|doctor|appointment|invoice|confirmation)\b/i,
  /\b(in|from|check) my (email|inbox|gmail)\b/i,
  /\b(replace(ment)?) (piece|part|filter|hinge|cartridge|battery|cable|charger)\b/i,
  /\bremember (the|when|that)\b/i,
  /\b(reply|respond|get back) to (her|him|them|the)\b/i,
];

export function isContextHinted(transcript: string): boolean {
  return CONTEXT_HINT_PATTERNS.some((p) => p.test(transcript));
}

// ─── AI prompt ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are mining the user's email history to turn a vague intent into a one-tap action.

Your only goal: figure out if the user is referring to a past purchase, person, or event that exists in their email. If yes, build an ActionCard whose primaryAction is a deep link the user can tap once to complete the task.

Rules:
- For Amazon reorders: extract product name and ASIN if visible. Build action {kind: "open_url", url: "https://www.amazon.com/dp/[ASIN]"} if you have an ASIN, OR {kind: "reorder_amazon", asin: null, query: "specific product search string"} if you do not.
- For replies: build {kind: "create_draft", emailId, subject, body, label}. Pre-write a complete reply.
- For event lookups: build {kind: "create_calendar", event: {title, date, durationMinutes, notes}, label}. Use the actual date/time from the email.
- For phone callbacks: build {kind: "open_url", url: "tel:+1XXXXXXXXXX", label: "Call ..."}.
- For generic tasks where no deep link applies: build {kind: "add_task", bucket: "today", label}.
- NEVER invent a product, person, ASIN, phone number, address, or date that is not clearly present in the email data. If you'd have to guess, return matched=false.
- The "context" field MUST cite the source: "From Amazon order, Aug 12, 2025" or "From Megan, May 1".
- The "title" field MUST be imperative and under 60 characters.
- "urgency" defaults to "today" unless the email itself implies a deadline.

Return ONLY valid JSON, no markdown fences, no prose:
{
  "matched": true | false,
  "card": {
    "title": "...",
    "context": "...",
    "urgency": "now" | "today" | "this_week" | "someday",
    "primaryAction": { "kind": "...", ... },
    "secondaryActions": [optional, up to 2],
    "relatedEmailIds": ["gmail-id-1", "gmail-id-2"]
  } | null,
  "reason": "short explanation of what you matched (or why not)"
}`;

// ─── Email shape we feed Claude ─────────────────────────────────────────────

export interface MinerEmail {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface MineResult {
  matched: boolean;
  card: ActionCard | null;
  reason: string;
}

export async function mineContextForUtterance(
  transcript: string,
  recentEmails: MinerEmail[],
  anthropicKey: string
): Promise<MineResult> {
  if (!anthropicKey) return { matched: false, card: null, reason: 'No Claude key configured.' };

  // ── Fast-path: local purchase index ──────────────────────────────────────
  // If the user is asking to reorder something we have a receipt for, build
  // the card synchronously without spending tokens. The local index gets
  // populated weekly by the background receipt indexer.
  const localMatch = await tryLocalPurchaseLookup(transcript);
  if (localMatch) {
    return { matched: true, card: localMatch, reason: 'Matched local purchase index' };
  }

  if (recentEmails.length === 0) {
    return { matched: false, card: null, reason: 'No emails available to mine.' };
  }

  const userPrompt = `User said: "${transcript}"

Recent emails available (last ${recentEmails.length}, most recent first):
${JSON.stringify(recentEmails.slice(0, 50), null, 2)}

Now decide: does any of these emails clearly contain the prior context the user is referring to? If yes, build the ActionCard. If no, return matched=false.`;

  let raw: string;
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
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      console.warn(`[ContextMiner] Claude API ${response.status}:`, err.slice(0, 200));
      return { matched: false, card: null, reason: `Claude API ${response.status}` };
    }
    const data = await response.json();
    raw = data.content?.[0]?.text ?? '';
  } catch (e: any) {
    console.warn('[ContextMiner] network error:', e?.message ?? e);
    return { matched: false, card: null, reason: 'Network error' };
  }

  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn('[ContextMiner] JSON parse failed:', e, '\nRaw:', cleaned.slice(0, 300));
    return { matched: false, card: null, reason: 'Invalid JSON' };
  }

  if (!parsed.matched || !parsed.card) {
    return { matched: false, card: null, reason: parsed.reason ?? 'No match' };
  }

  // Normalize the AI's output into a fully-formed ActionCard.
  const card = normalizeMinedCard(parsed.card);
  if (!card) {
    return { matched: false, card: null, reason: 'Card payload invalid' };
  }
  return { matched: true, card, reason: parsed.reason ?? 'Matched' };
}

// ─── Normalization ──────────────────────────────────────────────────────────

function normalizeMinedCard(raw: any): ActionCard | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.title || !raw.context) return null;

  const payload = normalizePayload(raw.primaryAction);
  if (!payload) return null;

  const secondary = Array.isArray(raw.secondaryActions)
    ? (raw.secondaryActions as any[])
        .map(normalizePayload)
        .filter((p): p is ActionPayload => p !== null)
        .slice(0, 2)
    : undefined;

  const urgency =
    raw.urgency === 'now' ||
    raw.urgency === 'today' ||
    raw.urgency === 'this_week' ||
    raw.urgency === 'someday'
      ? raw.urgency
      : 'today';

  // ctx- prefix → parsed by parseCardId() as 'manual' so dismiss/snooze
  // route to the actionCards storage rather than a phantom source action.
  return {
    id: `ctx-${nanoid()}`,
    source: 'voice',
    title: String(raw.title).slice(0, 120),
    context: String(raw.context).slice(0, 240),
    urgency,
    primaryAction: payload,
    secondaryActions: secondary,
    firstStep: null,
    relatedEmailIds: Array.isArray(raw.relatedEmailIds)
      ? raw.relatedEmailIds.map(String)
      : undefined,
    sourceId: null,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
}

// ─── Local purchase lookup (fast path for reorders) ────────────────────────

const REORDER_INTENT = /\b(again|reorder|re-order|repurchase|buy (it|that|another)|need (another|more))\b/i;

async function tryLocalPurchaseLookup(transcript: string): Promise<ActionCard | null> {
  if (!REORDER_INTENT.test(transcript)) return null;
  let candidates: PurchaseRecord[];
  try {
    candidates = await findInPurchaseIndex(transcript, 3);
  } catch {
    return null;
  }
  if (candidates.length === 0) return null;
  const top = candidates[0];

  const payload: ActionPayload = top.asin
    ? {
        kind: 'reorder_amazon',
        asin: top.asin,
        query: top.productName,
        label: 'Reorder on Amazon',
      }
    : {
        kind: 'reorder_amazon',
        query: top.productName,
        label: 'Find on Amazon',
      };

  const orderDate = new Date(top.orderedAt);
  const dateLabel = isNaN(orderDate.getTime())
    ? 'recently'
    : orderDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const priceLabel = top.price ? `${top.price} from ${top.vendor}` : `from ${top.vendor}`;

  return {
    id: `ctx-${nanoid()}`,
    source: 'voice',
    title: `Reorder ${top.productName.slice(0, 50)}`,
    context: `Bought ${priceLabel} on ${dateLabel}.`,
    urgency: 'today',
    primaryAction: payload,
    secondaryActions: undefined,
    firstStep: null,
    relatedEmailIds: [top.emailId],
    sourceId: null,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
}

function normalizePayload(raw: any): ActionPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind = raw.kind;
  switch (kind) {
    case 'open_url':
      if (!raw.url) return null;
      return {
        kind: 'open_url',
        url: String(raw.url),
        label: String(raw.label ?? 'Open'),
      };
    case 'reorder_amazon':
      if (!raw.query && !raw.asin) return null;
      return {
        kind: 'reorder_amazon',
        asin: raw.asin ? String(raw.asin) : undefined,
        query: String(raw.query ?? ''),
        label: String(raw.label ?? 'Reorder on Amazon'),
      };
    case 'create_calendar':
      if (!raw.event?.title) return null;
      return {
        kind: 'create_calendar',
        event: {
          title: String(raw.event.title),
          date: raw.event.date ? String(raw.event.date) : null,
          durationMinutes: Number(raw.event.durationMinutes ?? 60) || 60,
          notes: raw.event.notes ? String(raw.event.notes) : undefined,
        },
        label: String(raw.label ?? 'Add to calendar'),
      };
    case 'create_draft':
      return {
        kind: 'create_draft',
        emailId: String(raw.emailId ?? ''),
        subject: String(raw.subject ?? ''),
        body: String(raw.body ?? ''),
        label: String(raw.label ?? 'Draft reply'),
      };
    case 'add_task':
      return {
        kind: 'add_task',
        bucket: raw.bucket === 'upcoming' || raw.bucket === 'someday' ? raw.bucket : 'today',
        label: String(raw.label ?? 'Add to tasks'),
      };
    case 'mark_done':
      return { kind: 'mark_done', label: String(raw.label ?? 'Got it') };
    default:
      return null;
  }
}
