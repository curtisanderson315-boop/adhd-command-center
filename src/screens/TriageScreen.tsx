/**
 * Email Triage Screen
 * One email at a time. Tap an action. Done.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAppStore } from '../store';
import { PriorityBadge } from '../components/PriorityBadge';
import { colors, spacing, radius, typography } from '../theme';
import { relativeTime } from '../services/utils';
import { fetchUnreadEmails } from '../services/gmail';
import { triageEmail } from '../services/ai';
import { createDraft, archiveMessage, markAsRead } from '../services/gmail';
import { createEvent } from '../services/calendar';
import { getSavedEmail } from '../services/auth';
import type { TriagedEmail, TriageSuggestedAction } from '../types';
import { nanoid } from '../services/utils';

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

export function TriageScreen() {
  const { triageQueue, setTriageQueue, removeFromTriage, settings, addTask, lastTriageAt, setLastTriageAt } =
    useAppStore();
  const [loading, setLoading] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);

  const current = triageQueue[currentIdx] ?? null;

  const runTriage = useCallback(async () => {
    if (!settings.googleAccessToken && !settings.anthropicKey) {
      Alert.alert('Setup Required', 'Connect your Google account and add an OpenAI key in Settings.');
      return;
    }
    setLoading(true);
    try {
      const rawEmails = await fetchUnreadEmails(15);
      const triaged = await Promise.all(
        rawEmails.map((e) => triageEmail(e, settings.anthropicKey))
      );
      // Sort: urgent → action_needed → fyi → noise
      const order = { urgent: 0, action_needed: 1, fyi: 2, noise: 3 };
      triaged.sort((a, b) => order[a.priority] - order[b.priority]);
      setTriageQueue(triaged);
      setCurrentIdx(0);
      setLastTriageAt(Date.now());
    } catch (e: any) {
      Alert.alert('Triage Error', e.message);
    } finally {
      setLoading(false);
    }
  }, [settings]);

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
        Alert.alert('Draft saved', 'Your reply draft is in Gmail. Review and send when ready.');
      }

      if (action.actionType === 'calendar_event' && action.calendarEvent) {
        const dateStr = action.calendarEvent.date ?? new Date().toISOString();
        await createEvent({
          title: action.calendarEvent.title,
          startDate: new Date(dateStr),
          durationMinutes: action.calendarEvent.durationMinutes ?? 60,
        });
        await markAsRead(email.id);
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
      }

      if (action.actionType === 'archive') {
        await archiveMessage(email.id);
      }
    } catch (e: any) {
      console.warn('Action error:', e.message);
    }

    // Advance to next
    removeFromTriage(email.id);
    setCurrentIdx((i) => Math.max(0, i));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Email Triage</Text>
        {lastTriageAt && (
          <Text style={styles.headerSub}>
            Last checked {relativeTime(new Date(lastTriageAt).toISOString())}
          </Text>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.purple} />
          <Text style={styles.loadingText}>Reading your inbox…</Text>
        </View>
      ) : triageQueue.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyTitle}>All caught up!</Text>
          <Text style={styles.emptySub}>No emails waiting for triage.</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={runTriage}>
            <Text style={styles.refreshBtnText}>Check now</Text>
          </TouchableOpacity>
        </View>
      ) : current ? (
        <ScrollView contentContainerStyle={styles.card}>
          {/* Progress indicator */}
          <Text style={styles.progress}>
            {currentIdx + 1} of {triageQueue.length}
          </Text>

          {/* Priority badge */}
          <PriorityBadge priority={current.priority} />

          {/* From / Subject */}
          <Text style={styles.subject} numberOfLines={3}>
            {current.subject}
          </Text>
          <Text style={styles.from}>{current.from}</Text>
          <Text style={styles.time}>{relativeTime(current.receivedAt)}</Text>

          {/* AI summary */}
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>WHAT IS THIS</Text>
            <Text style={styles.summaryText}>{current.summary}</Text>
            {current.priorityReason ? (
              <Text style={styles.reasonText}>↑ {current.priorityReason}</Text>
            ) : null}
          </View>

          {/* Action buttons */}
          <Text style={styles.actionsLabel}>WHAT TO DO</Text>
          <View style={styles.actions}>
            {current.suggestedActions.map((action, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.actionBtn,
                  { backgroundColor: ACTION_BG[action.actionType] ?? '#1e1e2e' },
                ]}
                onPress={() => handleAction(current, action)}
              >
                <Text
                  style={[
                    styles.actionLabel,
                    { color: ACTION_COLOR[action.actionType] ?? colors.textPrimary },
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Skip */}
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => {
              removeFromTriage(current.id);
              setCurrentIdx((i) => Math.max(0, i));
            }}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : null}

      {!loading && triageQueue.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={runTriage}>
          <Text style={styles.fabText}>↺</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: typography.h1,
  headerSub: { ...typography.bodyMuted, marginTop: 4 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  loadingText: { ...typography.body, color: colors.textSecondary, marginTop: spacing.md },
  emptyIcon: { fontSize: 52 },
  emptyTitle: typography.h2,
  emptySub: { ...typography.bodyMuted, textAlign: 'center' },
  refreshBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.purple,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
  },
  refreshBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  progress: {
    ...typography.caption,
    color: colors.textMuted,
    alignSelf: 'flex-end',
  },
  subject: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 28,
    marginTop: spacing.xs,
  },
  from: { ...typography.bodyMuted },
  time: { ...typography.caption },
  summaryBox: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  summaryLabel: typography.label,
  summaryText: {
    ...typography.body,
    lineHeight: 22,
  },
  reasonText: {
    ...typography.caption,
    color: colors.actionNeeded,
    marginTop: spacing.xs,
  },
  actionsLabel: { ...typography.label, marginTop: spacing.sm },
  actions: { gap: spacing.sm },
  actionBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  actionLabel: { fontWeight: '700', fontSize: 16 },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.lg },
  skipText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: colors.textSecondary, fontSize: 22 },
});
