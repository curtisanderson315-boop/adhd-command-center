/**
 * Suggestions Screen — Proactive Intelligence Engine (PIE)
 *
 * The 5th tab. Shows a ranked list of smart suggestions Claude has surfaced
 * by cross-referencing the user's email + calendar. Pull to refresh triggers
 * an on-demand scan. Auto-scans on focus when stale (> 5 min).
 *
 * One primary action per card. Swipe left or tap "Not relevant" to dismiss.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAppStore } from '../store';
import { SuggestionCard } from '../components/SuggestionCard';
import { colors, spacing, radius, typography } from '../theme';
import { relativeTime, nanoid } from '../services/utils';
import { fetchUnreadEmails, createDraft } from '../services/gmail';
import { createEvent, fetchUpcomingEvents } from '../services/calendar';
import { scanForSuggestions } from '../services/smartScan';
import { openAmazonSearch, openFlightSearch } from '../services/amazon';
import { getSavedEmail, isSignedIn } from '../services/auth';
import type { SmartSuggestion } from '../types';

const STALE_AFTER_MS = 5 * 60 * 1000; // 5 min — cooldown between auto-scans
const URGENCY_RANK = { high: 0, medium: 1, low: 2 } as const;

export function SuggestionsScreen() {
  const {
    suggestions,
    setSuggestions,
    dismissSuggestion,
    actionSuggestion,
    setLastScanAt,
    lastScanAt,
    settings,
    addTask,
  } = useAppStore();

  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoScanned = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const pending = suggestions
    .filter((s) => s.status === 'pending')
    .sort((a, b) => {
      const r = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
      if (r !== 0) return r;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  // ── Scan ───────────────────────────────────────────────────────────────────

  const runScan = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (scanning) return;
      if (!settings.anthropicKey) {
        if (!silent) {
          Alert.alert(
            'Add your Claude API key',
            'Open Settings and paste a key from console.anthropic.com to enable smart suggestions.'
          );
        }
        return;
      }
      const signed = await isSignedIn();
      if (!signed) {
        if (!silent) {
          Alert.alert(
            'Connect your Google account',
            'Open Settings and connect Gmail + Calendar so I can scan for you.'
          );
        }
        return;
      }

      setScanning(true);
      try {
        const userEmail = (await getSavedEmail()) ?? settings.userEmail ?? '';
        const [emails, events] = await Promise.all([
          fetchUnreadEmails(20).catch(() => []),
          fetchUpcomingEvents(30).catch(() => []),
        ]);

        const fresh = await scanForSuggestions(
          emails,
          events,
          userEmail,
          settings.anthropicKey
        );

        await setSuggestions(fresh);
        await setLastScanAt(new Date().toISOString());
      } catch (e: any) {
        if (!silent) {
          Alert.alert('Scan failed', e?.message ?? 'Try pulling to refresh.');
        }
      } finally {
        setScanning(false);
      }
    },
    [
      scanning,
      settings.anthropicKey,
      settings.userEmail,
      setSuggestions,
      setLastScanAt,
    ]
  );

  // Auto-scan once on focus when stale
  useFocusEffect(
    useCallback(() => {
      if (hasAutoScanned.current) return;
      if (!settings.anthropicKey) return;

      const lastScanMs = lastScanAt ? new Date(lastScanAt).getTime() : 0;
      const isStale = Date.now() - lastScanMs > STALE_AFTER_MS;
      if (isStale) {
        hasAutoScanned.current = true;
        void runScan({ silent: true });
      }
    }, [runScan, lastScanAt, settings.anthropicKey])
  );

  // ── Action handlers ────────────────────────────────────────────────────────

  const handleAction = useCallback(
    async (suggestion: SmartSuggestion) => {
      const { action } = suggestion;
      try {
        switch (action.type) {
          case 'calendar': {
            const dateStr = action.event.date ?? new Date().toISOString();
            const startDate = new Date(dateStr);
            if (isNaN(startDate.getTime())) {
              showToast('Could not add — date unknown');
              return;
            }
            await createEvent({
              title: action.event.title,
              startDate,
              durationMinutes: action.event.durationMinutes ?? 60,
              notes: action.event.notes ?? null,
            });
            await actionSuggestion(suggestion.id);
            showToast('Added to your calendar');
            return;
          }

          case 'amazon': {
            await openAmazonSearch(action.searchQuery);
            await actionSuggestion(suggestion.id);
            showToast('Opening Amazon...');
            return;
          }

          case 'flights': {
            await openFlightSearch(action.destination, action.departureDateISO);
            await actionSuggestion(suggestion.id);
            showToast('Opening Google Flights...');
            return;
          }

          case 'draft_reply': {
            const fromEmail = (await getSavedEmail()) ?? settings.userEmail ?? '';
            await createDraft({
              subject: action.subject || '(no subject)',
              body: action.draftBody,
              fromEmail,
            });
            await actionSuggestion(suggestion.id);
            showToast('Draft saved to Gmail');
            return;
          }

          case 'task': {
            await addTask({
              id: nanoid(),
              title: action.taskTitle,
              notes: action.notes,
              bucket: 'today',
              priority: suggestion.urgency === 'high' ? 'high' : 'medium',
              completed: false,
              createdAt: new Date().toISOString(),
              sourceEmailId: suggestion.sourceEmailId ?? null,
            });
            await actionSuggestion(suggestion.id);
            showToast('Added to your tasks');
            return;
          }

          case 'none':
          default:
            await actionSuggestion(suggestion.id);
            return;
        }
      } catch (e: any) {
        Alert.alert('Action failed', e?.message ?? 'Try again in a moment.');
      }
    },
    [actionSuggestion, addTask, settings.userEmail, showToast]
  );

  const handleDismiss = useCallback(
    (id: string) => {
      void dismissSuggestion(id);
    },
    [dismissSuggestion]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const headerSub = (() => {
    if (scanning) return 'Scanning...';
    if (!lastScanAt) return 'Pull down to scan your inbox + calendar.';
    return `Last checked ${relativeTime(lastScanAt)}`;
  })();

  const setupNeeded = !settings.anthropicKey;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>What needs attention</Text>
        <Text style={styles.headerSub}>{headerSub}</Text>
      </View>

      {setupNeeded ? (
        <ScrollView contentContainerStyle={styles.center}>
          <Text style={styles.emptyIcon}>🔧</Text>
          <Text style={styles.emptyTitle}>Set up first</Text>
          <Text style={styles.emptySub}>
            Add your Claude API key in Settings to enable smart suggestions.
          </Text>
        </ScrollView>
      ) : pending.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.center}
          refreshControl={
            <RefreshControl
              refreshing={scanning}
              onRefresh={() => void runScan()}
              tintColor={colors.purple}
            />
          }
        >
          <Text style={styles.emptyIcon}>✓</Text>
          <Text style={styles.emptyTitle}>You&apos;re all caught up</Text>
          <Text style={styles.emptySub}>
            Nothing needs your attention right now. Pull down to refresh.
          </Text>
        </ScrollView>
      ) : (
        <FlatList
          data={pending}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <SuggestionCard
              suggestion={item}
              onAction={handleAction}
              onDismiss={handleDismiss}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={scanning}
              onRefresh={() => void runScan()}
              tintColor={colors.purple}
            />
          }
        />
      )}

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
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
  list: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  center: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyIcon: { fontSize: 52 },
  emptyTitle: typography.h2,
  emptySub: { ...typography.bodyMuted, textAlign: 'center' },
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
