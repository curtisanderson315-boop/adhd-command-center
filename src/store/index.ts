import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  ActionCard,
  ActionCardStatus,
  CapturedAction,
  TriagedEmail,
  Task,
  Note,
  AppSettings,
  SmartSuggestion,
} from '../types';
import { getStoredTriageQueue } from '../services/background';
import { stableHash } from '../services/utils';
import { dedupKey as suggestionDedupKey } from '../services/smartScan';

interface AppState {
  // ── Captured items (voice captures) ──────────────────────────────────────
  captures: CapturedAction[];
  addCapture: (action: CapturedAction) => Promise<void>;
  updateCapture: (id: string, updates: Partial<CapturedAction>) => Promise<void>;
  removeCapture: (id: string) => Promise<void>;

  // ── Email triage ──────────────────────────────────────────────────────────
  triageQueue: TriagedEmail[];
  setTriageQueue: (emails: TriagedEmail[]) => void;
  removeFromTriage: (id: string) => void;
  lastTriageAt: number | null;
  setLastTriageAt: (ts: number) => void;

  // ── Tasks ─────────────────────────────────────────────────────────────────
  tasks: Task[];
  addTask: (task: Task) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  removeTask: (id: string) => Promise<void>;

  // ── Notes ─────────────────────────────────────────────────────────────────
  notes: Note[];
  addNote: (note: Note) => Promise<void>;
  removeNote: (id: string) => Promise<void>;

  // ── Settings ──────────────────────────────────────────────────────────────
  settings: AppSettings;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;

  // ── Smart Suggestions (Proactive Intelligence Engine) ────────────────────
  suggestions: SmartSuggestion[];
  lastScanAt: string | null;
  setSuggestions: (suggestions: SmartSuggestion[]) => Promise<void>;
  dismissSuggestion: (id: string) => Promise<void>;
  actionSuggestion: (id: string) => Promise<void>;
  setLastScanAt: (ts: string) => Promise<void>;

  // ── Action Cards (v2 unified surface) ────────────────────────────────────
  actionCards: ActionCard[];
  upsertCard: (card: ActionCard) => Promise<void>;
  upsertCards: (cards: ActionCard[]) => Promise<void>;
  markCardStatus: (id: string, status: ActionCardStatus) => Promise<void>;
  dismissCard: (id: string) => Promise<void>;
  snoozeCard: (id: string, untilISO: string) => Promise<void>;
  setCardFirstStep: (id: string, firstStep: string) => Promise<void>;

  // ── Archived Cards (Bundle list dismiss + Undo) ──────────────────────────
  archivedCards: ActionCard[];
  archiveCard: (card: ActionCard) => Promise<void>;
  restoreCard: (id: string) => Promise<void>;

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  hydrate: () => Promise<void>;
}

const DEFAULT_SETTINGS: AppSettings = {
  anthropicKey: '',
  openaiKey: '',
  googleAccessToken: '',
  googleRefreshToken: '',
  googleTokenExpiry: 0,
  userEmail: '',
  triageIntervalMinutes: 15,
  notificationsEnabled: true,
};

const STORAGE_KEYS = {
  captures: '@adhd:captures',
  tasks: '@adhd:tasks',
  notes: '@adhd:notes',
  settings: '@adhd:settings',
  lastTriageAt: '@adhd:lastTriageAt',
  triageQueue: '@adhd:triageQueue',
  suggestions: '@adhd:suggestions',
  lastScanAt: '@adhd:lastScanAt',
  actionCards: '@adhd:actionCards',
  archivedCards: '@adhd:archivedCards',
};

const ARCHIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Collapse entries that share an id, keeping the one with the latest
 * createdAt (or the last one in input order if createdAt is missing).
 * Used by hydrate() to clean up legacy duplicates from earlier builds.
 */
function dedupeById<T extends { id: string; createdAt?: string }>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }
    const aT = item.createdAt ? new Date(item.createdAt).getTime() : 0;
    const bT = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
    if (aT >= bT) byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

export const useAppStore = create<AppState>((set, get) => ({
  captures: [],
  triageQueue: [],
  lastTriageAt: null,
  tasks: [],
  notes: [],
  settings: DEFAULT_SETTINGS,
  suggestions: [],
  lastScanAt: null,
  actionCards: [],
  archivedCards: [],

  // ── Captures ───────────────────────────────────────────────────────────────
  addCapture: async (action) => {
    const updated = [action, ...get().captures];
    set({ captures: updated });
    await AsyncStorage.setItem(STORAGE_KEYS.captures, JSON.stringify(updated));
  },

  updateCapture: async (id, updates) => {
    const updated = get().captures.map((c) =>
      c.id === id ? { ...c, ...updates } : c
    );
    set({ captures: updated });
    await AsyncStorage.setItem(STORAGE_KEYS.captures, JSON.stringify(updated));
  },

  removeCapture: async (id) => {
    const updated = get().captures.filter((c) => c.id !== id);
    set({ captures: updated });
    await AsyncStorage.setItem(STORAGE_KEYS.captures, JSON.stringify(updated));
  },

  // ── Triage ─────────────────────────────────────────────────────────────────
  setTriageQueue: (emails) => {
    set({ triageQueue: emails });
    AsyncStorage.setItem(STORAGE_KEYS.triageQueue, JSON.stringify(emails));
  },

  removeFromTriage: (id) =>
    set((state) => {
      const next = state.triageQueue.filter((e) => e.id !== id);
      AsyncStorage.setItem(STORAGE_KEYS.triageQueue, JSON.stringify(next));
      return { triageQueue: next };
    }),

  setLastTriageAt: (ts) => {
    set({ lastTriageAt: ts });
    AsyncStorage.setItem(STORAGE_KEYS.lastTriageAt, String(ts));
  },

  // ── Tasks ──────────────────────────────────────────────────────────────────
  addTask: async (task) => {
    const updated = [task, ...get().tasks];
    set({ tasks: updated });
    await AsyncStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(updated));
  },

  toggleTask: async (id) => {
    const updated = get().tasks.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    set({ tasks: updated });
    await AsyncStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(updated));
  },

  removeTask: async (id) => {
    const updated = get().tasks.filter((t) => t.id !== id);
    set({ tasks: updated });
    await AsyncStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(updated));
  },

  // ── Notes ──────────────────────────────────────────────────────────────────
  addNote: async (note) => {
    const updated = [note, ...get().notes];
    set({ notes: updated });
    await AsyncStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(updated));
  },

  removeNote: async (id) => {
    const updated = get().notes.filter((n) => n.id !== id);
    set({ notes: updated });
    await AsyncStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(updated));
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  updateSettings: async (updates) => {
    const updated = { ...get().settings, ...updates };
    set({ settings: updated });
    await AsyncStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(updated));
  },

  // ── Smart Suggestions ──────────────────────────────────────────────────────
  setSuggestions: async (incoming) => {
    // Merge with existing, dedupe by id (newer entry wins)
    const existing = get().suggestions;
    const byId = new Map<string, SmartSuggestion>();
    for (const s of existing) byId.set(s.id, s);
    for (const s of incoming) byId.set(s.id, s);
    const merged = Array.from(byId.values());
    set({ suggestions: merged });
    await AsyncStorage.setItem(STORAGE_KEYS.suggestions, JSON.stringify(merged));
  },

  dismissSuggestion: async (id) => {
    const updated = get().suggestions.map((s) =>
      s.id === id ? { ...s, status: 'dismissed' as const } : s
    );
    set({ suggestions: updated });
    await AsyncStorage.setItem(STORAGE_KEYS.suggestions, JSON.stringify(updated));
  },

  actionSuggestion: async (id) => {
    const updated = get().suggestions.map((s) =>
      s.id === id ? { ...s, status: 'actioned' as const } : s
    );
    set({ suggestions: updated });
    await AsyncStorage.setItem(STORAGE_KEYS.suggestions, JSON.stringify(updated));
  },

  setLastScanAt: async (ts) => {
    set({ lastScanAt: ts });
    await AsyncStorage.setItem(STORAGE_KEYS.lastScanAt, ts);
  },

  // ── Action Cards ──────────────────────────────────────────────────────────
  upsertCard: async (card) => {
    const existing = get().actionCards;
    const idx = existing.findIndex((c) => c.id === card.id);
    const next =
      idx >= 0
        ? existing.map((c, i) => (i === idx ? { ...c, ...card } : c))
        : [card, ...existing];
    set({ actionCards: next });
    await AsyncStorage.setItem(STORAGE_KEYS.actionCards, JSON.stringify(next));
  },

  upsertCards: async (cards) => {
    if (cards.length === 0) return;
    const existing = get().actionCards;
    const byId = new Map<string, ActionCard>();
    for (const c of existing) byId.set(c.id, c);
    for (const c of cards) {
      const prev = byId.get(c.id);
      // Preserve user-added enrichments (firstStep, status overrides) when
      // the same id is upserted from a fresher source projection.
      byId.set(c.id, prev ? { ...prev, ...c, firstStep: prev.firstStep ?? c.firstStep } : c);
    }
    const next = Array.from(byId.values());
    set({ actionCards: next });
    await AsyncStorage.setItem(STORAGE_KEYS.actionCards, JSON.stringify(next));
  },

  markCardStatus: async (id, status) => {
    const next = get().actionCards.map((c) =>
      c.id === id
        ? {
            ...c,
            status,
            completedAt: status === 'done' ? new Date().toISOString() : c.completedAt,
          }
        : c
    );
    set({ actionCards: next });
    await AsyncStorage.setItem(STORAGE_KEYS.actionCards, JSON.stringify(next));
  },

  dismissCard: async (id) => {
    const next = get().actionCards.map((c) =>
      c.id === id ? { ...c, status: 'dismissed' as const } : c
    );
    set({ actionCards: next });
    await AsyncStorage.setItem(STORAGE_KEYS.actionCards, JSON.stringify(next));
  },

  snoozeCard: async (id, untilISO) => {
    const next = get().actionCards.map((c) =>
      c.id === id
        ? { ...c, status: 'snoozed' as const, snoozeUntil: untilISO }
        : c
    );
    set({ actionCards: next });
    await AsyncStorage.setItem(STORAGE_KEYS.actionCards, JSON.stringify(next));
  },

  setCardFirstStep: async (id, firstStep) => {
    const next = get().actionCards.map((c) =>
      c.id === id ? { ...c, firstStep } : c
    );
    set({ actionCards: next });
    await AsyncStorage.setItem(STORAGE_KEYS.actionCards, JSON.stringify(next));
  },

  // ── Archived Cards ────────────────────────────────────────────────────────
  // archiveCard stashes a copy with archivedAt set + removes the card from
  // actionCards if it lived there (ctx-/manual cards). For source-projected
  // cards the source is left untouched; the archive list is consulted at
  // render time by NowFeed so the card vanishes from the feed without
  // mutating the source.
  archiveCard: async (card) => {
    const stamped: ActionCard = {
      ...card,
      status: 'dismissed',
      archivedAt: new Date().toISOString(),
    };
    const archive = [stamped, ...get().archivedCards.filter((c) => c.id !== card.id)];
    const cards = get().actionCards.filter((c) => c.id !== card.id);
    set({ archivedCards: archive, actionCards: cards });
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.archivedCards, JSON.stringify(archive)),
      AsyncStorage.setItem(STORAGE_KEYS.actionCards, JSON.stringify(cards)),
    ]);
  },

  // restoreCard pulls back from the archive. Source-projected cards reappear
  // automatically on next render. Manual cards (ctx-/bundle-) are re-upserted
  // into actionCards so they show up again.
  restoreCard: async (id) => {
    const found = get().archivedCards.find((c) => c.id === id);
    const archive = get().archivedCards.filter((c) => c.id !== id);
    set({ archivedCards: archive });
    await AsyncStorage.setItem(STORAGE_KEYS.archivedCards, JSON.stringify(archive));
    if (found && (id.startsWith('ctx-') || id.startsWith('manual-') || id.startsWith('bundle-'))) {
      const restored: ActionCard = {
        ...found,
        status: 'pending',
        archivedAt: null,
      };
      const cards = [restored, ...get().actionCards.filter((c) => c.id !== id)];
      set({ actionCards: cards });
      await AsyncStorage.setItem(STORAGE_KEYS.actionCards, JSON.stringify(cards));
    }
  },

  // ── Hydrate from storage ───────────────────────────────────────────────────
  hydrate: async () => {
    try {
      const [
        captures,
        tasks,
        notes,
        settings,
        lastTriageAt,
        backgroundQueue,
        suggestions,
        lastScanAt,
        actionCards,
        archivedCards,
      ] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.captures),
        AsyncStorage.getItem(STORAGE_KEYS.tasks),
        AsyncStorage.getItem(STORAGE_KEYS.notes),
        AsyncStorage.getItem(STORAGE_KEYS.settings),
        AsyncStorage.getItem(STORAGE_KEYS.lastTriageAt),
        getStoredTriageQueue(),
        AsyncStorage.getItem(STORAGE_KEYS.suggestions),
        AsyncStorage.getItem(STORAGE_KEYS.lastScanAt),
        AsyncStorage.getItem(STORAGE_KEYS.actionCards),
        AsyncStorage.getItem(STORAGE_KEYS.archivedCards),
      ]);

      // Purge archive entries older than 30 days on every hydrate. Cheap
      // and keeps the local index small. See ARCHIVE_TTL_MS.
      const rawArchived: ActionCard[] = archivedCards ? JSON.parse(archivedCards) : [];
      const now = Date.now();
      const purgedArchived = rawArchived.filter((c) => {
        if (!c.archivedAt) return true;
        return now - new Date(c.archivedAt).getTime() < ARCHIVE_TTL_MS;
      });
      if (purgedArchived.length !== rawArchived.length) {
        await AsyncStorage.setItem(
          STORAGE_KEYS.archivedCards,
          JSON.stringify(purgedArchived)
        );
      }

      // Iteration 3 fix (still Bug B's territory): the previous dedupe
      // pass collapsed by id only, but persisted SmartSuggestions from
      // pre-fix scans had nanoid ids — different per scan even when the
      // content matched. So duplicates with distinct ids slipped through.
      // Two-step migration:
      //   (1) Recompute every persisted SmartSuggestion's id under the
      //       new stableHash(suggestionDedupKey(...)) scheme. Anything
      //       that was content-equivalent now shares an id.
      //   (2) Run dedupeById to collapse the now-matching duplicates.
      const rawSuggestions: SmartSuggestion[] = suggestions
        ? JSON.parse(suggestions)
        : [];
      const migratedSuggestions = rawSuggestions.map((s) => {
        const expected = stableHash(suggestionDedupKey(s));
        return s.id === expected ? s : { ...s, id: expected };
      });
      const dedupedSuggestions = dedupeById(migratedSuggestions);
      const suggestionsChanged =
        dedupedSuggestions.length !== rawSuggestions.length ||
        migratedSuggestions.some((m, i) => m.id !== rawSuggestions[i]?.id);
      if (suggestionsChanged) {
        await AsyncStorage.setItem(
          STORAGE_KEYS.suggestions,
          JSON.stringify(dedupedSuggestions)
        );
      }

      // ActionCards storage cleanup. Three things happening:
      //   (1) Drop orphan source-prefixed entries (smart-/voice-/task-/
      //       email-) that don't match any current SmartSuggestion id.
      //       These are stale syncSourcesToActionCards writes from
      //       pre-fix scans — they ride along forever via mergeStored
      //       Overlays' manualOnly path, surfacing as duplicates.
      //   (2) Collapse ctx- cards by content (same title +
      //       primaryAction → keep latest). Curtis's repeat recordings
      //       of the same intent were producing one ctx- card each.
      //   (3) dedupeById covers anything that got migrated to a now-
      //       shared id.
      const rawCards: ActionCard[] = actionCards ? JSON.parse(actionCards) : [];
      const validSmartIds = new Set(
        dedupedSuggestions.map((s) => `smart-${s.id}`)
      );
      const cleanedCards = rawCards.filter((c) => {
        // Smart projections only valid if the underlying SmartSuggestion
        // still exists post-migration. Other source prefixes (voice/
        // task/email) keep enrichments — drop only the smart orphans.
        if (c.id.startsWith('smart-')) return validSmartIds.has(c.id);
        return true;
      });
      const ctxByContent = new Map<string, ActionCard>();
      const nonCtx: ActionCard[] = [];
      for (const c of cleanedCards) {
        if (!c.id.startsWith('ctx-')) {
          nonCtx.push(c);
          continue;
        }
        const key = `ctx|${c.title}|${JSON.stringify(c.primaryAction)}`;
        const existing = ctxByContent.get(key);
        if (
          !existing ||
          new Date(c.createdAt).getTime() >= new Date(existing.createdAt).getTime()
        ) {
          ctxByContent.set(key, c);
        }
      }
      const dedupedCards = dedupeById([...nonCtx, ...ctxByContent.values()]);
      if (dedupedCards.length !== rawCards.length) {
        await AsyncStorage.setItem(
          STORAGE_KEYS.actionCards,
          JSON.stringify(dedupedCards)
        );
      }

      set({
        captures: captures ? JSON.parse(captures) : [],
        tasks: tasks ? JSON.parse(tasks) : [],
        notes: notes ? JSON.parse(notes) : [],
        settings: settings
          ? { ...DEFAULT_SETTINGS, ...JSON.parse(settings) }
          : DEFAULT_SETTINGS,
        lastTriageAt: lastTriageAt ? Number(lastTriageAt) : null,
        triageQueue: backgroundQueue,
        suggestions: dedupedSuggestions,
        lastScanAt: lastScanAt ?? null,
        actionCards: dedupedCards,
        archivedCards: purgedArchived,
      });
    } catch (e) {
      console.error('Failed to hydrate store:', e);
    }
  },
}));
