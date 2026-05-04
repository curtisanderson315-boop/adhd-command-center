// ─── Action types ───────────────────────────────────────────────────────────

export type ActionType = 'calendar_event' | 'gmail_draft' | 'task' | 'note';

export interface CapturedAction {
  id: string;
  type: ActionType;
  title: string;
  body?: string | null;
  date?: string | null;           // ISO 8601
  durationMinutes?: number | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  priority: 'high' | 'medium' | 'low';
  needsClarification?: string | null;
  confirmationText: string;
  createdAt: string;              // ISO 8601
  routedTo?: string | null;       // e.g. "Gmail draft", "Calendar", "Tasks"
  status: 'pending' | 'routed' | 'dismissed';
}

// ─── Email triage ────────────────────────────────────────────────────────────

export type EmailPriority = 'urgent' | 'action_needed' | 'fyi' | 'noise';

export type TriageActionType = 'reply' | 'calendar_event' | 'task' | 'archive' | 'snooze';

export interface TriageSuggestedAction {
  actionType: TriageActionType;
  label: string;
  draftBody?: string | null;
  calendarEvent?: {
    title: string;
    date: string | null;
    durationMinutes: number;
  } | null;
  taskText?: string | null;
  snoozeUntil?: string | null;
}

export interface TriagedEmail {
  id: string;                     // Gmail message ID
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  summary: string;
  priority: EmailPriority;
  priorityReason: string;
  suggestedActions: TriageSuggestedAction[];
  status: 'pending' | 'actioned' | 'dismissed';
}

// ─── Task ────────────────────────────────────────────────────────────────────

export type TaskBucket = 'today' | 'upcoming' | 'someday';

export interface Task {
  id: string;
  title: string;
  notes?: string;
  bucket: TaskBucket;
  priority: 'high' | 'medium' | 'low';
  dueDate?: string | null;
  completed: boolean;
  createdAt: string;
  sourceEmailId?: string | null;  // if created from email triage
}

// ─── Note ────────────────────────────────────────────────────────────────────

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

// ─── App settings ────────────────────────────────────────────────────────────

export interface AppSettings {
  anthropicKey: string;
  googleAccessToken: string;
  googleRefreshToken: string;
  googleTokenExpiry: number;
  userEmail: string;
  triageIntervalMinutes: number;  // default 15
  notificationsEnabled: boolean;
}

// ─── Smart Suggestions (Proactive Intelligence Engine) ─────────────────────

export type SuggestionType =
  | 'add_to_calendar'
  | 'purchase'
  | 'book_travel'
  | 'reply_needed'
  | 'overdue_task'
  | 'follow_up';

export type SuggestionAction =
  | { type: 'calendar'; event: { title: string; date: string | null; durationMinutes: number; notes?: string } }
  | { type: 'amazon'; searchQuery: string; productDescription: string }
  | { type: 'flights'; destination: string; departureDateISO: string | null; returnDateISO: string | null }
  | { type: 'draft_reply'; emailId: string; subject: string; draftBody: string }
  | { type: 'task'; taskTitle: string; notes?: string }
  | { type: 'none' };

export interface SmartSuggestion {
  id: string;
  type: SuggestionType;
  title: string;
  context: string;
  urgency: 'high' | 'medium' | 'low';
  action: SuggestionAction;
  sourceEmailId?: string | null;
  createdAt: string;
  status: 'pending' | 'actioned' | 'dismissed';
}
