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
};

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
      ]);

      set({
        captures: captures ? JSON.parse(captures) : [],
        tasks: tasks ? JSON.parse(tasks) : [],
        notes: notes ? JSON.parse(notes) : [],
        settings: settings
          ? { ...DEFAULT_SETTINGS, ...JSON.parse(settings) }
          : DEFAULT_SETTINGS,
        lastTriageAt: lastTriageAt ? Number(lastTriageAt) : null,
        triageQueue: backgroundQueue,
        suggestions: suggestions ? JSON.parse(suggestions) : [],
        lastScanAt: lastScanAt ?? null,
        actionCards: actionCards ? JSON.parse(actionCards) : [],
      });
    } catch (e) {
      console.error('Failed to hydrate store:', e);
    }
  },
}));
