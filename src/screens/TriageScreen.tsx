/**
 * Email Triage Screen — one email at a time. Tap an action. Done.
 *
 * Auto-fetches on focus when a Google account + Claude key are connected.
 * Swipe left to archive, right to dismiss as FYI.
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
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as Notifications from 'expo-notifications';
import { useAppStore } from '../store';
import { PriorityBadge } from '../components/PriorityBadge';
import { colors, spacing, radius, typography } from '../theme';
import { relativeTime, nanoid } from '../services/utils';
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

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 110;

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
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoFetched = useRef(false);

  const current = triageQueue[0] ?? null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

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
        const triaged = await Promise.all(
          rawEmails.map((e) => triageEmail(e, settings.anthropicKey))
        );
        const order = { urgent: 0, action_needed: 1, fyi: 2, noise: 3 };
        triaged.sort((a, b) => order[a.priority] - order[b.priority]);
        setTriageQueue(triaged);
        setLastTriageAt(Date.now());
      } catch (e: any) {
        if (!silent) Alert.alert('Triage error', e?.message ?? 'Something went wrong.');
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

  // ── Action handlers ──────────────────────────────────────────────────

  const completeAction = useCallback(
    (emailId: string, message: string) => {
      removeFromTriage(emailId);
      showToast(message);
    },
    [removeFromTriage, showToast]
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
      Alert.alert('Action failed', e?.message ?? 'Try again in a moment.');
    }
  };

  const handleArchiveSwipe = async (email: TriagedEmail) => {
    try {
      await archiveMessage(email.id);
    } catch {
      // Already removed locally; surface nothing if API hiccups
    }
    completeAction(email.id, '🗑 Archived');
  };

  const handleDismissSwipe = async (email: TriagedEmail) => {
    try {
      await markAsRead(email.id);
    } catch {
      /* noop */
    }
    completeAction(email.id, '✓ Marked as read');
  };

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Email Triage</Text>
        {lastTriageAt ? (
          <Text style={styles.headerSub}>
            Last checked {relativeTime(new Date(lastTriageAt).toISOString())}
          </Text>
        ) : (
          <Text style={styles.headerSub}>Pull down to check your inbox.</Text>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.purple} />
          <Text style={styles.loadingText}>Checking your inbox...</Text>
        </View>
      ) : triageQueue.length === 0 ? (
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
      ) : current ? (
        <SwipeableTriageCard
          key={current.id}
          email={current}
          queueSize={triageQueue.length}
          onSwipeArchive={() => handleArchiveSwipe(current)}
          onSwipeDismiss={() => handleDismissSwipe(current)}
          onAction={(action) => handleAction(current, action)}
          onSkip={() => completeAction(current.id, 'Skipped')}
        />
      ) : null}

      {!loading && triageQueue.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={() => void runTriage()}>
          <Text style={styles.fabText}>↺</Text>
        </TouchableOpacity>
      )}

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// ── Swipeable card ──────────────────────────────────────────────────────

interface CardProps {
  email: TriagedEmail;
  queueSize: number;
  onSwipeArchive: () => void;
  onSwipeDismiss: () => void;
  onAction: (action: TriageSuggestedAction) => void;
  onSkip: () => void;
}

function SwipeableTriageCard({
  email,
  queueSize,
  onSwipeArchive,
  onSwipeDismiss,
  onAction,
  onSkip,
}: CardProps) {
  const translateX = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 220 }, () => {
          runOnJS(onSwipeArchive)();
        });
      } else if (e.translationX > SWIPE_THRESHOLD) {
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 220 }, () => {
          runOnJS(onSwipeDismiss)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 20 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      {
        rotate: `${interpolate(
          translateX.value,
          [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
          [-8, 0, 8],
          Extrapolation.CLAMP
        )}deg`,
      },
    ],
  }));

  const archiveHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  const dismissHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <View style={styles.cardLayer}>
      <Animated.View style={[styles.swipeHint, styles.swipeHintLeft, archiveHintStyle]}>
        <Text style={styles.swipeHintIcon}>🗑</Text>
        <Text style={styles.swipeHintText}>Archive</Text>
      </Animated.View>
      <Animated.View style={[styles.swipeHint, styles.swipeHintRight, dismissHintStyle]}>
        <Text style={styles.swipeHintIcon}>✓</Text>
        <Text style={styles.swipeHintText}>Got it</Text>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.cardWrap, cardStyle]}>
          <ScrollView contentContainerStyle={styles.card}>
            <Text style={styles.progress}>1 of {queueSize}</Text>
            <PriorityBadge priority={email.priority} />

            <Text style={styles.subject} numberOfLines={3}>
              {email.subject}
            </Text>
            <Text style={styles.from}>{email.from}</Text>
            <Text style={styles.time}>{relativeTime(email.receivedAt)}</Text>

            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>WHAT IS THIS</Text>
              <Text style={styles.summaryText}>{email.summary}</Text>
              {email.priorityReason ? (
                <Text style={styles.reasonText}>↑ {email.priorityReason}</Text>
              ) : null}
            </View>

            <Text style={styles.actionsLabel}>WHAT TO DO</Text>
            <View style={styles.actions}>
              {email.suggestedActions.map((action, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.actionBtn,
                    { backgroundColor: ACTION_BG[action.actionType] ?? '#1e1e2e' },
                  ]}
                  onPress={() => onAction(action)}
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

            <Text style={styles.swipeFooter}>
              Swipe left to archive · right to dismiss
            </Text>

            <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
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
    flexGrow: 1,
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

  cardLayer: { flex: 1, position: 'relative' },
  cardWrap: { flex: 1 },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  swipeHint: {
    position: 'absolute',
    top: '40%',
    alignItems: 'center',
    gap: 4,
    zIndex: 0,
  },
  swipeHintLeft: { right: 32 },
  swipeHintRight: { left: 32 },
  swipeHintIcon: { fontSize: 36 },
  swipeHintText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  progress: {
    ...typography.caption,
    color: colors.textMuted,
    alignSelf: 'flex-end',
  },
  subject: {
    fontSize: 22,
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
    minHeight: 52,
    justifyContent: 'center',
  },
  actionLabel: { fontWeight: '700', fontSize: 16 },
  swipeFooter: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.md },
  skipText: { color: colors.textMuted, fontSize: 16, fontWeight: '600' },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: colors.textSecondary, fontSize: 22 },
  toast: {
    position: 'absolute',
    bottom: 100,
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
