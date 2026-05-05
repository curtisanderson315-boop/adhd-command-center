/**
 * Inbox (Email Triage) — list view.
 *
 * Each unread + triaged email is one row. Tap a row to expand it inline:
 * the summary, priority reason, and the AI's suggested actions are
 * revealed. Action buttons (reply / calendar / task / archive / snooze)
 * fire the existing routing flow.
 *
 * Replaces the prior single-card-with-swipe UX (Curtis preferred a list
 * after iter 3 device testing). The action plumbing — runTriage, the
 * throttled triage fan-out, action-handler logic, completeAction — is
 * preserved verbatim from that build.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  FlatList,
  Pressable,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Notifications from 'expo-notifications';
import { useAppStore } from '../store';
import { PriorityBadge } from '../components/PriorityBadge';
import { colors, spacing, radius, typography } from '../theme';
import { relativeTime, nanoid, runWithConcurrency } from '../services/utils';
import {
  fetchUnreadEmails,
  createDraft,
  archiveMessage,
  markAsRead,
} from '../services/gmail';
import { triageEmail } from '../services/ai';
import { createEvent } from '../services/calendar';
import { getSavedEmail, isSignedIn } from '../services/auth';
import type { TriagedEmail, TriageSuggestedAction } from '../types';

// ─── Action visual mapping (compact button colors) ────────────────────────

const ACTION_BG: Record<string, string> = {
  reply: '#1e2a4a',
  calendar_event: '#1a2e1a',
  task: '#2a2a10',
  archive: '#1e1e2e',
  snooze: '#1e1e2e',
};

const ACTION_COLOR: Record<string, string> = {
  reply: colors.info,
  calendar_event: colors.fyi,
  task: colors.actionNeeded,
  archive: colors.textMuted,
  snooze: colors.textMuted,
};

const PRIORITY_ORDER: Record<TriagedEmail['priority'], number> = {
  urgent: 0,
  action_needed: 1,
  fyi: 2,
  noise: 3,
};

export function TriageScreen() {
  const {
    triageQueue,
    setTriageQueue,
    removeFromTriage,
    settings,
    addTask,
    lastTriageAt,
    setLastTriageAt,
  } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoFetched = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // ── Triage fetch ────────────────────────────────────────────────────────

  const runTriage = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!settings.anthropicKey) {
        if (!silent) {
          Alert.alert(
            'Add your Claude API key',
            'Open Settings and paste a key from console.anthropic.com to enable triage.'
          );
        }
        return;
      }
      const signed = await isSignedIn();
      if (!signed) {
        if (!silent) {
          Alert.alert(
            'Connect your Google account',
            'Open Settings and connect Gmail so I can read your inbox.'
          );
        }
        return;
      }

      if (silent) setRefreshing(true);
      else setLoading(true);

      try {
        const rawEmails = await fetchUnreadEmails(15);
        if (rawEmails.length === 0) {
          setTriageQueue([]);
          setLastTriageAt(Date.now());
          return;
        }
        // Throttled fan-out — Anthropic's concurrent-connection limit
        // kills a naive Promise.all over 10+ unread emails. (Iter 1.)
        const triagedRaw = await runWithConcurrency(
          rawEmails,
          (e) => triageEmail(e, settings.anthropicKey),
          { concurrency: 2, spacingMs: 250, label: 'TriageScreen.triage' }
        );
        const triaged = triagedRaw.filter((t): t is NonNullable<typeof t> => t !== null);
        triaged.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
        setTriageQueue(triaged);
        setLastTriageAt(Date.now());
      } catch (e: any) {
        if (!silent) Alert.alert("Couldn't pull that up", e?.message ?? 'Pull to refresh in a moment.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [settings.anthropicKey, setTriageQueue, setLastTriageAt]
  );

  // Auto-fetch on first focus per session if queue is empty
  useFocusEffect(
    useCallback(() => {
      if (
        !hasAutoFetched.current &&
        triageQueue.length === 0 &&
        settings.anthropicKey
      ) {
        hasAutoFetched.current = true;
        void runTriage({ silent: true });
      }
    }, [runTriage, triageQueue.length, settings.anthropicKey])
  );

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // ── Action handlers ─────────────────────────────────────────────────────
  // Same plumbing the swipe build used. Each handler ends in
  // completeAction(emailId, message), which removes from queue + toasts.

  const completeAction = useCallback(
    (emailId: string, message: string) => {
      removeFromTriage(emailId);
      if (expandedId === emailId) setExpandedId(null);
      showToast(message);
    },
    [removeFromTriage, showToast, expandedId]
  );

  const handleAction = async (email: TriagedEmail, action: TriageSuggestedAction) => {
    try {
      if (action.actionType === 'reply' && action.draftBody) {
        const fromEmail = (await getSavedEmail()) ?? '';
        await createDraft({
          to: email.from,
          subject: `Re: ${email.subject}`,
          body: action.draftBody,
          fromEmail,
        });
        await markAsRead(email.id);
        completeAction(email.id, '✉️ Draft saved to Gmail');
        return;
      }

      if (action.actionType === 'calendar_event' && action.calendarEvent) {
        const dateStr = action.calendarEvent.date ?? new Date().toISOString();
        await createEvent({
          title: action.calendarEvent.title,
          startDate: new Date(dateStr),
          durationMinutes: action.calendarEvent.durationMinutes ?? 60,
        });
        await markAsRead(email.id);
        completeAction(email.id, '📅 Added to Calendar');
        return;
      }

      if (action.actionType === 'task' && action.taskText) {
        await addTask({
          id: nanoid(),
          title: action.taskText,
          bucket: 'today',
          priority: email.priority === 'urgent' ? 'high' : 'medium',
          completed: false,
          createdAt: new Date().toISOString(),
          sourceEmailId: email.id,
        });
        await markAsRead(email.id);
        completeAction(email.id, '✅ Added to Today');
        return;
      }

      if (action.actionType === 'archive') {
        await archiveMessage(email.id);
        completeAction(email.id, '🗑 Archived');
        return;
      }

      if (action.actionType === 'snooze') {
        const until = action.snoozeUntil ? new Date(action.snoozeUntil) : null;
        if (until && until.getTime() > Date.now() && settings.notificationsEnabled) {
          const seconds = Math.max(60, Math.floor((until.getTime() - Date.now()) / 1000));
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '⏰ Snoozed email is back',
              body: email.subject,
              data: { emailId: email.id, type: 'snooze' },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds,
              repeats: false,
            },
          });
        }
        completeAction(email.id, '😴 Snoozed');
      }
    } catch (e: any) {
      Alert.alert("Couldn't do that", e?.message ?? 'Try again in a moment.');
    }
  };

  // Quick row-level dismiss (no AI action) — equivalent to "mark as read".
  const handleQuickDismiss = async (email: TriagedEmail) => {
    try {
      await markAsRead(email.id);
    } catch {
      /* noop — local removal still proceeds */
    }
    completeAction(email.id, '✓ Marked as read');
  };

  // ── Render ──────────────────────────────────────────────────────────────

  const headerSub = lastTriageAt
    ? `Last checked ${relativeTime(new Date(lastTriageAt).toISOString())}`
    : 'Pull down to check your inbox.';

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Inbox</Text>
          <Text style={styles.headerSub}>{headerSub}</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.purple} />
          <Text style={styles.loadingText}>Checking your inbox...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (triageQueue.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Inbox</Text>
          <Text style={styles.headerSub}>{headerSub}</Text>
        </View>
        <ScrollView
          contentContainerStyle={styles.center}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void runTriage({ silent: true })}
              tintColor={colors.purple}
            />
          }
        >
          <Text style={styles.emptyIcon}>📬</Text>
          <Text style={styles.emptyTitle}>Inbox zero</Text>
          <Text style={styles.emptySub}>
            Nothing to triage right now. Pull down to check again.
          </Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => void runTriage()}>
            <Text style={styles.refreshBtnText}>Check now</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Inbox</Text>
        <Text style={styles.headerSub}>
          {headerSub} · {triageQueue.length} to review
        </Text>
      </View>

      <FlatList
        data={triageQueue}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TriageRow
            email={item}
            expanded={expandedId === item.id}
            onToggle={() =>
              setExpandedId((cur) => (cur === item.id ? null : item.id))
            }
            onAction={(a) => handleAction(item, a)}
            onDismiss={() => handleQuickDismiss(item)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void runTriage({ silent: true })}
            tintColor={colors.purple}
          />
        }
        ListFooterComponent={<View style={{ height: 80 }} />}
      />

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// ─── One row: compact by default, expands inline ──────────────────────────

interface RowProps {
  email: TriagedEmail;
  expanded: boolean;
  onToggle: () => void;
  onAction: (a: TriageSuggestedAction) => void;
  onDismiss: () => void;
}

function TriageRow({ email, expanded, onToggle, onAction, onDismiss }: RowProps) {
  const expandValue = useSharedValue(0);

  useEffect(() => {
    expandValue.value = withTiming(expanded ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded]);

  const expandStyle = useAnimatedStyle(() => ({
    opacity: expandValue.value,
    maxHeight: expandValue.value * 700,
  }));

  const fromName = prettyFrom(email.from);

  return (
    <View style={styles.row}>
      <Pressable onPress={onToggle} style={styles.rowHeader} hitSlop={4}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.rowMetaRow}>
            <PriorityBadge priority={email.priority} />
            <Text style={styles.rowFrom} numberOfLines={1}>
              {fromName}
            </Text>
          </View>
          <Text style={styles.rowSubject} numberOfLines={2}>
            {email.subject}
          </Text>
          {!expanded ? (
            <Text style={styles.rowSummary} numberOfLines={2}>
              {email.summary}
            </Text>
          ) : null}
        </View>
        <Text style={styles.chev}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>

      <Animated.View
        style={[styles.expandBlock, expandStyle]}
        pointerEvents={expanded ? 'auto' : 'none'}
      >
        <Text style={styles.expandedSummary}>{email.summary}</Text>
        {email.priorityReason ? (
          <Text style={styles.priorityReason}>Why: {email.priorityReason}</Text>
        ) : null}

        {email.suggestedActions.length > 0 ? (
          <View style={styles.actionsRow}>
            {email.suggestedActions.slice(0, 3).map((a, idx) => (
              <TouchableOpacity
                key={`${email.id}-action-${idx}`}
                style={[
                  styles.actionBtn,
                  { backgroundColor: ACTION_BG[a.actionType] ?? '#1e1e2e' },
                ]}
                onPress={() => onAction(a)}
              >
                <Text
                  style={[
                    styles.actionBtnText,
                    { color: ACTION_COLOR[a.actionType] ?? colors.textPrimary },
                  ]}
                  numberOfLines={1}
                >
                  {a.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <TouchableOpacity onPress={onDismiss} style={styles.dismissLink} hitSlop={8}>
          <Text style={styles.dismissText}>Mark as read & skip</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function prettyFrom(from: string): string {
  // "Sarah Smith <sarah@example.com>" → "Sarah Smith"
  const m = from.match(/^"?([^"<]+?)"?\s*<.+>$/);
  return (m?.[1] ?? from).trim();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: typography.h1,
  headerSub: { ...typography.bodyMuted, marginTop: 4 },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  loadingText: { ...typography.bodyMuted, marginTop: spacing.md },
  emptyIcon: { fontSize: 52 },
  emptyTitle: typography.h2,
  emptySub: { ...typography.bodyMuted, textAlign: 'center' },
  refreshBtn: {
    backgroundColor: colors.purple,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  refreshBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Row container
  row: {
    backgroundColor: colors.bgCard,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rowMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  rowFrom: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    minWidth: 0,
  },
  rowSubject: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 4,
  },
  rowSummary: {
    ...typography.bodyMuted,
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  chev: {
    color: colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
    paddingTop: 2,
    paddingHorizontal: 4,
  },

  // Expanded block
  expandBlock: {
    overflow: 'hidden',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  expandedSummary: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  priorityReason: {
    color: colors.textSecondary,
    fontSize: 13,
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: 4,
  },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    minWidth: 100,
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  dismissLink: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  dismissText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // Toast
  toast: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: colors.bgCard,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
