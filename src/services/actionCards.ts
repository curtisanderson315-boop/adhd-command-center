/**
 * ActionCard converters — ADHD Command Center v2
 *
 * The ActionCard is the unified surface layer in v2. Source-specific types
 * (CapturedAction, TriagedEmail, SmartSuggestion, Task) remain authoritative;
 * these helpers project them onto the same UI primitive so the Now Feed can
 * render everything from the same component.
 *
 * Conversions are pure: same input → same output. Status comes from the
 * source where applicable, so a "done" Task or "actioned" SmartSuggestion
 * carries the right ActionCard.status without extra bookkeeping.
 */

import type {
  ActionCard,
  ActionCardStatus,
  ActionPayload,
  ActionUrgency,
  CapturedAction,
  SmartSuggestion,
  Task,
  TriagedEmail,
  TriageSuggestedAction,
} from '../types';
import { buildAmazonSearchUrl, buildFlightsUrl } from './amazon';

// ─── Voice / CapturedAction ────────────────────────────────────────────────

export function cardFromCapturedAction(a: CapturedAction): ActionCard {
  // Bug A from device-testing iteration 2: routed captures (e.g. "voice
  // note → Gmail draft created") used to project as status 'done', and
  // NowFeed filters those out — so the user saw the side effect happen
  // but no card. Now: routed captures stay 'pending' so they surface in
  // the feed, and primaryAction swaps to mark_done so tapping the button
  // never re-executes the side effect.
  const isRouted = a.status === 'routed';

  let primary: ActionPayload;
  let secondary: ActionPayload[] | undefined;

  if (isRouted) {
    // Side effect already done. Card sits in feed for awareness; tap to
    // dismiss. Future iteration could deep-link "Open Gmail" / "Open
    // Calendar", but for v1 a clean ack is enough.
    primary = { kind: 'mark_done', label: 'Got it' };
  } else {
    switch (a.type) {
      case 'gmail_draft':
        primary = {
          kind: 'create_draft',
          emailId: '',
          subject: a.title,
          body: a.body ?? '',
          label: 'Save draft',
        };
        break;

      case 'calendar_event':
        primary = {
          kind: 'create_calendar',
          event: {
            title: a.title,
            date: a.date ?? null,
            durationMinutes: a.durationMinutes ?? 60,
            notes: a.body ?? undefined,
          },
          label: 'Add to calendar',
        };
        break;

      case 'task':
        primary = { kind: 'mark_done', label: 'Mark done' };
        secondary = [{ kind: 'snooze', until: '', label: 'Snooze' }];
        break;

      case 'note':
      default:
        primary = { kind: 'mark_done', label: 'Got it' };
        break;
    }
  }

  return {
    id: `voice-${a.id}`,
    source: 'voice',
    title: a.title,
    context: contextFromCapture(a),
    urgency: urgencyFromCapture(a),
    primaryAction: primary,
    secondaryActions: secondary,
    firstStep: null,
    sourceId: a.id,
    createdAt: a.createdAt,
    status: statusFromCapture(a.status),
  };
}

function contextFromCapture(a: CapturedAction): string {
  if (a.routedTo) return `Captured by voice • ${a.routedTo}`;
  if (a.needsClarification) return a.needsClarification;
  if (a.body) return a.body.slice(0, 140);
  return 'Captured by voice';
}

function statusFromCapture(s: CapturedAction['status']): ActionCardStatus {
  // 'routed' captures stay pending in the feed (see Bug A note above).
  // The primary button is mark_done so they don't re-trigger their side
  // effect on tap.
  if (s === 'dismissed') return 'dismissed';
  return 'pending';
}

// Voice-capture urgency rule (design call from device-testing iteration 2):
// "today" is the right default for a voice note captured NOW. Only override
// if the AI extracted an explicit future date — then derive urgency from
// proximity. No date → today. (Replaced the old priority-based mapping; the
// AI's `priority` field still drives the colored dot but no longer affects
// which time horizon the card lands in.)
function urgencyFromCapture(a: CapturedAction): ActionUrgency {
  if (a.date) {
    const t = new Date(a.date).getTime();
    if (!isNaN(t)) {
      const diffDays = (t - Date.now()) / (24 * 60 * 60 * 1000);
      if (diffDays < 1) return 'today';
      if (diffDays < 7) return 'this_week';
      return 'someday';
    }
  }
  return 'today';
}

// ─── Email triage / TriagedEmail ───────────────────────────────────────────

export function cardFromTriagedEmail(e: TriagedEmail): ActionCard {
  const actions = e.suggestedActions ?? [];
  const primary = payloadFromTriageAction(actions[0], e) ?? {
    kind: 'mark_done',
    label: 'Got it',
  };
  const secondary = actions
    .slice(1, 3)
    .map((a) => payloadFromTriageAction(a, e))
    .filter((p): p is ActionPayload => p !== null);

  return {
    id: `email-${e.id}`,
    source: 'email',
    title: e.summary || e.subject,
    context: `From ${prettyFrom(e.from)} — ${e.priorityReason || e.subject}`,
    urgency: urgencyFromEmailPriority(e.priority),
    primaryAction: primary,
    secondaryActions: secondary.length > 0 ? secondary : undefined,
    firstStep: null,
    relatedEmailIds: [e.id],
    sourceId: e.id,
    createdAt: e.receivedAt,
    status: e.status === 'actioned' ? 'done' : e.status === 'dismissed' ? 'dismissed' : 'pending',
  };
}

function payloadFromTriageAction(
  a: TriageSuggestedAction | undefined,
  email: TriagedEmail
): ActionPayload | null {
  if (!a) return null;
  switch (a.actionType) {
    case 'reply':
      return {
        kind: 'create_draft',
        emailId: email.id,
        subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
        body: a.draftBody ?? '',
        label: a.label || 'Draft reply',
      };
    case 'calendar_event':
      if (!a.calendarEvent) return null;
      return {
        kind: 'create_calendar',
        event: {
          title: a.calendarEvent.title,
          date: a.calendarEvent.date ?? null,
          durationMinutes: a.calendarEvent.durationMinutes ?? 60,
        },
        label: a.label || 'Add to calendar',
      };
    case 'task':
      return {
        kind: 'add_task',
        bucket: 'today',
        label: a.label || 'Add to tasks',
      };
    case 'archive':
      return { kind: 'mark_done', label: a.label || 'Archive' };
    case 'snooze':
      return {
        kind: 'snooze',
        until: a.snoozeUntil ?? '',
        label: a.label || 'Snooze',
      };
    default:
      return null;
  }
}

function prettyFrom(from: string): string {
  // "Sarah Smith <sarah@example.com>" → "Sarah Smith"
  const match = from.match(/^"?([^"<]+?)"?\s*<.+>$/);
  return (match?.[1] ?? from).trim();
}

// ─── Smart suggestion / PIE ────────────────────────────────────────────────

export function cardFromSmartSuggestion(s: SmartSuggestion): ActionCard {
  const primary = payloadFromSuggestionAction(s);

  return {
    id: `smart-${s.id}`,
    source: 'smart_scan',
    title: s.title,
    context: s.context,
    urgency: urgencyFromSuggestionUrgency(s.urgency),
    primaryAction: primary,
    secondaryActions: undefined,
    firstStep: null,
    relatedEmailIds: s.sourceEmailId ? [s.sourceEmailId] : undefined,
    sourceId: s.id,
    createdAt: s.createdAt,
    status: s.status === 'actioned' ? 'done' : s.status === 'dismissed' ? 'dismissed' : 'pending',
  };
}

function payloadFromSuggestionAction(s: SmartSuggestion): ActionPayload {
  const a = s.action;
  switch (a.type) {
    case 'calendar':
      return {
        kind: 'create_calendar',
        event: {
          title: a.event.title,
          date: a.event.date ?? null,
          durationMinutes: a.event.durationMinutes ?? 60,
          notes: a.event.notes,
        },
        label: 'Add to calendar',
      };
    case 'amazon':
      return {
        kind: 'reorder_amazon',
        query: a.searchQuery,
        label: 'Find on Amazon',
      };
    case 'flights':
      return {
        kind: 'open_url',
        url: buildFlightsUrl(a.destination, a.departureDateISO),
        label: 'Search flights',
      };
    case 'draft_reply':
      return {
        kind: 'create_draft',
        emailId: a.emailId,
        subject: a.subject,
        body: a.draftBody,
        label: 'Draft reply',
      };
    case 'task':
      return { kind: 'add_task', bucket: 'today', label: 'Add to tasks' };
    case 'none':
    default:
      return { kind: 'mark_done', label: 'Got it' };
  }
}

// ─── Task ──────────────────────────────────────────────────────────────────

export function cardFromTask(t: Task): ActionCard {
  return {
    id: `task-${t.id}`,
    source: 'manual',
    title: t.title,
    context: t.notes ? t.notes.slice(0, 140) : bucketLabel(t.bucket),
    urgency: urgencyFromBucket(t.bucket),
    primaryAction: { kind: 'mark_done', label: 'Mark done' },
    secondaryActions: [{ kind: 'snooze', until: '', label: 'Snooze' }],
    firstStep: null,
    sourceId: t.id,
    createdAt: t.createdAt,
    status: t.completed ? 'done' : 'pending',
  };
}

function bucketLabel(b: Task['bucket']): string {
  if (b === 'today') return 'On your list for today';
  if (b === 'upcoming') return 'Coming up';
  return 'Someday';
}

function urgencyFromBucket(b: Task['bucket']): ActionUrgency {
  if (b === 'today') return 'today';
  if (b === 'upcoming') return 'this_week';
  return 'someday';
}

// ─── Shared mappers ────────────────────────────────────────────────────────

function urgencyFromSuggestionUrgency(u: 'high' | 'medium' | 'low'): ActionUrgency {
  if (u === 'high') return 'today';
  if (u === 'medium') return 'this_week';
  return 'someday';
}

function urgencyFromEmailPriority(
  p: TriagedEmail['priority']
): ActionUrgency {
  if (p === 'urgent') return 'now';
  if (p === 'action_needed') return 'today';
  if (p === 'fyi') return 'this_week';
  return 'someday';
}

// ─── Comparator for ordering Now Feed ──────────────────────────────────────

const URGENCY_RANK: Record<ActionUrgency, number> = {
  now: 0,
  today: 1,
  this_week: 2,
  someday: 3,
};

export function compareCards(a: ActionCard, b: ActionCard): number {
  const r = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
  if (r !== 0) return r;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export { URGENCY_RANK };

// ─── Now Feed projection ───────────────────────────────────────────────────

/**
 * Project all source-of-truth state onto ActionCards. Runs every render of
 * the Now Feed; the operation is pure and cheap (just .map). Source remains
 * authoritative for status — the stored `actionCards` overlay only adds
 * enrichments (firstStep) and absorbs manually-created cards (contextMiner).
 */
export function projectAllSources(input: {
  captures: CapturedAction[];
  tasks: Task[];
  triageQueue: TriagedEmail[];
  suggestions: SmartSuggestion[];
}): ActionCard[] {
  // Iteration 3 fix: skip voice projections that already routed into a
  // local Task. The Task itself projects via cardFromTask; rendering the
  // voice card on top would double up "Got it" + "Mark done" for the same
  // recording. Other routed types (gmail_draft / calendar_event / note)
  // keep their voice card because nothing else surfaces them locally —
  // the draft lives in Gmail, the event in Google Calendar, etc.
  // Iteration 4 fix: voice CapturedActions and Tasks have per-event nanoid
  // ids, so the same intent recorded twice produces two distinct entities
  // and projects to two cards. Collapse by content (source + normalized
  // title), keeping the latest createdAt — the source data stays
  // untouched, only the rendered surface dedupes.
  const fromCaptures = collapseByContent(
    input.captures
      .filter((c) => !(c.type === 'task' && c.status === 'routed'))
      .map(cardFromCapturedAction)
  );
  const fromTasks = collapseByContent(input.tasks.map(cardFromTask));
  // Skip noise — fyi/noise emails shouldn't bubble into the Now Feed; they
  // stay in the Inbox tab where the user can review at their pace.
  const fromTriage = input.triageQueue
    .filter((e) => e.priority === 'urgent' || e.priority === 'action_needed')
    .map(cardFromTriagedEmail);
  const fromSmart = input.suggestions
    .filter((s) => s.status === 'pending')
    .map(cardFromSmartSuggestion);

  return [...fromCaptures, ...fromTasks, ...fromTriage, ...fromSmart];
}

/**
 * Merge persisted overlays into the projected card list. Stored cards either
 * (a) enrich a projected card with firstStep + relatedEmailIds, or
 * (b) appear as manual cards (id not present in projection — typically from
 *     contextMiner or the activation coach).
 *
 * Critically: status comes from the SOURCE for projected cards. To dismiss a
 * projected card, call the source-specific dismiss action (the card vanishes
 * on the next render). Stored-only manual cards keep their stored status.
 */
export function mergeStoredOverlays(
  projected: ActionCard[],
  stored: ActionCard[]
): ActionCard[] {
  const projectedIds = new Set(projected.map((c) => c.id));
  const storedById = new Map(stored.map((c) => [c.id, c]));

  const enriched = projected.map((p) => {
    const s = storedById.get(p.id);
    if (!s) return p;
    return {
      ...p,
      firstStep: p.firstStep ?? s.firstStep ?? null,
      relatedEmailIds: p.relatedEmailIds ?? s.relatedEmailIds,
      // Honor stored snooze on a still-pending source card so swipe-to-snooze
      // hides it for the requested window without losing the underlying source.
      ...(s.status === 'snoozed' && p.status === 'pending'
        ? { status: 'snoozed' as const, snoozeUntil: s.snoozeUntil }
        : {}),
      ...(s.status === 'dismissed' && p.status === 'pending'
        ? { status: 'dismissed' as const }
        : {}),
    };
  });

  // Iteration 4 fix: collapse manual-overlay duplicates by content. ctx-
  // cards minted by contextMiner during a session use a nanoid suffix, so
  // saying "reorder Brita filters" twice in the same session would
  // surface twice until the next hydrate ran the content-collapse pass.
  // Doing the collapse here too means in-session repeats don't show.
  const manualOnly = collapseByContent(
    stored.filter((c) => !projectedIds.has(c.id))
  );
  return [...enriched, ...manualOnly];
}

/**
 * Collapse ActionCards that share content. The dedupe key is
 * `${source}|${normalized_title}` — same source AND same intent. Keeps
 * the entry with the latest createdAt. Used by projectAllSources for
 * voice/task projections (per-event ids cannot dedupe themselves) and
 * by mergeStoredOverlays for the manual-overlay path (ctx-/manual-/
 * bundle- entries from session activity).
 */
function collapseByContent<T extends ActionCard>(cards: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const c of cards) {
    const key = `${c.source}|${c.title.toLowerCase().trim().replace(/\s+/g, ' ')}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, c);
      continue;
    }
    const incomingT = new Date(c.createdAt).getTime();
    const existingT = new Date(existing.createdAt).getTime();
    if (incomingT >= existingT) byKey.set(key, c);
  }
  return Array.from(byKey.values());
}

/**
 * Identify what kind of source a card id points to, so swipe-to-dismiss can
 * call the right source-specific action. Card ids are minted by the
 * converters with stable prefixes: voice-, task-, email-, smart-, plus
 * "manual-" / "ctx-" / "bundle-" for non-projected cards.
 */
export function parseCardId(id: string): {
  kind: 'voice' | 'task' | 'email' | 'smart' | 'manual';
  sourceId: string;
} {
  if (id.startsWith('voice-')) return { kind: 'voice', sourceId: id.slice('voice-'.length) };
  if (id.startsWith('task-')) return { kind: 'task', sourceId: id.slice('task-'.length) };
  if (id.startsWith('email-')) return { kind: 'email', sourceId: id.slice('email-'.length) };
  if (id.startsWith('smart-')) return { kind: 'smart', sourceId: id.slice('smart-'.length) };
  return { kind: 'manual', sourceId: id };
}

// ─── Background sync ───────────────────────────────────────────────────────

/**
 * Read all source state from AsyncStorage, project to ActionCards, and
 * upsert into @adhd:actionCards. Used by the background poll so the
 * activation coach (and any other card-list consumer) sees a complete
 * picture even when nothing has been persisted by user actions yet.
 *
 * Stays defensive: any storage read failure for an individual source
 * degrades to an empty list for that source rather than aborting the sync.
 */
export async function syncSourcesToActionCards(): Promise<number> {
  // Lazy import AsyncStorage to keep this module pure-import-safe
  const AsyncStorage = (await import('@react-native-async-storage/async-storage'))
    .default;

  const [capturesRaw, tasksRaw, triageRaw, suggestionsRaw, storedRaw] = await Promise.all([
    AsyncStorage.getItem('@adhd:captures').catch(() => null),
    AsyncStorage.getItem('@adhd:tasks').catch(() => null),
    AsyncStorage.getItem('@adhd:triageQueue').catch(() => null),
    AsyncStorage.getItem('@adhd:suggestions').catch(() => null),
    AsyncStorage.getItem('@adhd:actionCards').catch(() => null),
  ]);

  const captures: CapturedAction[] = capturesRaw ? safeParse(capturesRaw, []) : [];
  const tasks: Task[] = tasksRaw ? safeParse(tasksRaw, []) : [];
  const triageQueue: TriagedEmail[] = triageRaw ? safeParse(triageRaw, []) : [];
  const suggestions: SmartSuggestion[] = suggestionsRaw ? safeParse(suggestionsRaw, []) : [];
  const stored: ActionCard[] = storedRaw ? safeParse(storedRaw, []) : [];

  const projected = projectAllSources({ captures, tasks, triageQueue, suggestions });
  const projectedIds = new Set(projected.map((c) => c.id));
  const storedById = new Map(stored.map((c) => [c.id, c]));

  // Preserve enrichments (firstStep, snoozeUntil, dismissed status) when
  // a stored entry exists for a projected card.
  const merged: ActionCard[] = projected.map((p) => {
    const s = storedById.get(p.id);
    if (!s) return p;
    return {
      ...p,
      firstStep: p.firstStep ?? s.firstStep ?? null,
      ...(s.status === 'snoozed' || s.status === 'dismissed'
        ? { status: s.status, snoozeUntil: s.snoozeUntil }
        : {}),
    };
  });

  // Keep manual-only stored cards (ctx-, bundle-, manual-) alongside.
  const manualOnly = stored.filter((c) => !projectedIds.has(c.id));
  const next = [...merged, ...manualOnly];

  await AsyncStorage.setItem('@adhd:actionCards', JSON.stringify(next));
  return next.length;
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
