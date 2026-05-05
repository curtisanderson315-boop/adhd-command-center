/**
 * Now Feed — the v2 home screen.
 *
 * One hero card on top (the single highest-priority ActionCard right now),
 * then a scrollable stack of compact ActionCards. Above: a slim greeting
 * line with the time and the open-action count.
 *
 * The Now Feed is purely a renderer of ActionCards; it doesn't hold state.
 * Source projection happens via projectAllSources() and gets merged with
 * persisted overlays (firstStep, manual cards from contextMiner). The mic
 * lives at the App level (FloatingMic) — this screen has no capture UI.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  RefreshControl,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAppStore } from '../store';
import { ActionCard } from '../components/ActionCard';
import { colors, spacing, typography, radius } from '../theme';
import {
  compareCards,
  mergeStoredOverlays,
  parseCardId,
  projectAllSources,
} from '../services/actionCards';
import { fetchUnreadEmails, createDraft } from '../services/gmail';
import { createEvent, fetchUpcomingEvents } from '../services/calendar';
import { scanForSuggestions } from '../services/smartScan';
import { openAmazonSearch } from '../services/amazon';
import { getSavedEmail, isSignedIn } from '../services/auth';
import { nanoid } from '../services/utils';
import type { ActionCard as ActionCardModel, ActionPayload } from '../types';

const STALE_AFTER_MS = 5 * 60 * 1000;
const SNOOZE_MS = 60 * 60 * 1000; // 1 hour

export function HomeScreen() {
  const captures = useAppStore((s) => s.captures);
  const tasks = useAppStore((s) => s.tasks);
  const triageQueue = useAppStore((s) => s.triageQueue);
  const suggestions = useAppStore((s) => s.suggestions);
  const storedCards = useAppStore((s) => s.actionCards);
  const settings = useAppStore((s) => s.settings);
  const lastScanAt = useAppStore((s) => s.lastScanAt);

  const updateCapture = useAppStore((s) => s.updateCapture);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const removeFromTriage = useAppStore((s) => s.removeFromTriage);
  const actionSuggestion = useAppStore((s) => s.actionSuggestion);
  const dismissSuggestion = useAppStore((s) => s.dismissSuggestion);
  const setSuggestions = useAppStore((s) => s.setSuggestions);
  const setLastScanAt = useAppStore((s) => s.setLastScanAt);
  const addTask = useAppStore((s) => s.addTask);
  const dismissCard = useAppStore((s) => s.dismissCard);
  const snoozeCard = useAppStore((s) => s.snoozeCard);
  const markCardStatus = useAppStore((s) => s.markCardStatus);
  const upsertCard = useAppStore((s) => s.upsertCard);

  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasAutoScanned = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  // ── Project sources → cards → filter visible ────────────────────────────

  const visibleCards = useMemo(() => {
    const projected = projectAllSources({ captures, tasks, triageQueue, suggestions });
    const merged = mergeStoredOverlays(projected, storedCards);
    const now = Date.now();
    return merged
      .filter((c) => {
        if (c.status === 'pending') return true;
        if (c.status === 'snoozed' && c.snoozeUntil) {
          // snoozed cards reappear once their window has elapsed
          return new Date(c.snoozeUntil).getTime() < now;
        }
        return false;
      })
      .sort(compareCards);
  }, [captures, tasks, triageQueue, suggestions, storedCards]);

  const heroCard = visibleCards[0];
  const restCards = visibleCards.slice(1);

  // ── Scan (pull to refresh) ──────────────────────────────────────────────

  const runScan = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (scanning) return;
      if (!settings.anthropicKey) {
        if (!silent) showToast('Add your Claude key in Settings to scan');
        return;
      }
      const signed = await isSignedIn();
      if (!signed) {
        if (!silent) showToast('Connect Google in Settings to scan');
        return;
      }
      setScanning(true);
      try {
        const userEmail = (await getSavedEmail()) ?? settings.userEmail ?? '';
        const [emails, events] = await Promise.all([
          fetchUnreadEmails(20).catch(() => []),
          fetchUpcomingEvents(30).catch(() => []),
        ]);
        const fresh = await scanForSuggestions(emails, events, userEmail, settings.anthropicKey);
        await setSuggestions(fresh);
        await setLastScanAt(new Date().toISOString());
      } catch (e: any) {
        if (!silent) showToast("Couldn't pull that up. Pull to refresh.");
      } finally {
        setScanning(false);
      }
    },
    [scanning, settings.anthropicKey, settings.userEmail, setSuggestions, setLastScanAt, showToast]
  );

  useFocusEffect(
    useCallback(() => {
      if (hasAutoScanned.current) return;
      if (!settings.anthropicKey) return;
      const lastMs = lastScanAt ? new Date(lastScanAt).getTime() : 0;
      const stale = Date.now() - lastMs > STALE_AFTER_MS;
      if (stale) {
        hasAutoScanned.current = true;
        void runScan({ silent: true });
      }
    }, [runScan, lastScanAt, settings.anthropicKey])
  );

  // ── Source-aware dismiss / mark-done routing ────────────────────────────

  const markDoneAcrossSources = useCallback(
    async (card: ActionCardModel) => {
      const { kind, sourceId } = parseCardId(card.id);
      switch (kind) {
        case 'voice':
          await updateCapture(sourceId, { status: 'dismissed' });
          return;
        case 'task':
          await toggleTask(sourceId);
          return;
        case 'email':
          removeFromTriage(sourceId);
          return;
        case 'smart':
          await actionSuggestion(sourceId);
          return;
        case 'manual':
        default:
          await markCardStatus(card.id, 'done');
          return;
      }
    },
    [updateCapture, toggleTask, removeFromTriage, actionSuggestion, markCardStatus]
  );

  const dismissAcrossSources = useCallback(
    async (card: ActionCardModel) => {
      const { kind, sourceId } = parseCardId(card.id);
      switch (kind) {
        case 'voice':
          await updateCapture(sourceId, { status: 'dismissed' });
          return;
        case 'task':
          // Tasks don't have an explicit dismissed state — mark complete.
          await toggleTask(sourceId);
          return;
        case 'email':
          removeFromTriage(sourceId);
          return;
        case 'smart':
          await dismissSuggestion(sourceId);
          return;
        case 'manual':
        default:
          await dismissCard(card.id);
          return;
      }
    },
    [updateCapture, toggleTask, removeFromTriage, dismissSuggestion, dismissCard]
  );

  const snoozeAcrossSources = useCallback(
    async (card: ActionCardModel) => {
      const until = new Date(Date.now() + SNOOZE_MS).toISOString();
      // Snooze always lives in the actionCards overlay so we don't pollute
      // the source state with snooze metadata it doesn't model. Make sure
      // the card exists in storage first.
      await upsertCard({ ...card, status: 'snoozed', snoozeUntil: until });
      await snoozeCard(card.id, until);
    },
    [snoozeCard, upsertCard]
  );

  // ── Primary action: do the thing the card promises ──────────────────────

  const performPayload = useCallback(
    async (card: ActionCardModel, payload: ActionPayload) => {
      try {
        switch (payload.kind) {
          case 'open_url':
            await Linking.openURL(payload.url);
            await markDoneAcrossSources(card);
            showToast('Opening...');
            return;

          case 'reorder_amazon': {
            if (payload.asin) {
              await Linking.openURL(`https://www.amazon.com/dp/${payload.asin}`);
            } else {
              await openAmazonSearch(payload.query);
            }
            await markDoneAcrossSources(card);
            showToast('Opening Amazon...');
            return;
          }

          case 'create_calendar': {
            const dateStr = payload.event.date ?? new Date().toISOString();
            const startDate = new Date(dateStr);
            if (isNaN(startDate.getTime())) {
              showToast('Date unknown — pick one and tap again');
              return;
            }
            await createEvent({
              title: payload.event.title,
              startDate,
              durationMinutes: payload.event.durationMinutes ?? 60,
              notes: payload.event.notes ?? null,
            });
            await markDoneAcrossSources(card);
            showToast('Added to your calendar');
            return;
          }

          case 'create_draft': {
            const fromEmail = (await getSavedEmail()) ?? settings.userEmail ?? '';
            await createDraft({
              subject: payload.subject || '(no subject)',
              body: payload.body,
              fromEmail,
            });
            await markDoneAcrossSources(card);
            showToast('Draft saved to Gmail');
            return;
          }

          case 'add_task': {
            await addTask({
              id: nanoid(),
              title: card.title,
              notes: card.context,
              bucket: payload.bucket,
              priority: card.urgency === 'now' || card.urgency === 'today' ? 'high' : 'medium',
              completed: false,
              createdAt: new Date().toISOString(),
            });
            await markDoneAcrossSources(card);
            showToast('Added to your tasks');
            return;
          }

          case 'mark_done':
            await markDoneAcrossSources(card);
            showToast('Done');
            return;

          case 'snooze':
            await snoozeAcrossSources(card);
            showToast('Snoozed for an hour');
            return;
        }
      } catch (e: any) {
        Alert.alert("Couldn't do that", e?.message ?? 'Try again in a moment.');
      }
    },
    [markDoneAcrossSources, snoozeAcrossSources, addTask, settings.userEmail, showToast]
  );

  const handlePrimary = useCallback(
    (card: ActionCardModel) => performPayload(card, card.primaryAction),
    [performPayload]
  );

  const handleSecondary = useCallback(
    (card: ActionCardModel, payload: ActionPayload) => performPayload(card, payload),
    [performPayload]
  );

  // ── Render ──────────────────────────────────────────────────────────────

  const greeting = useMemo(() => {
    const now = new Date();
    const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const day = now.toLocaleDateString(undefined, { weekday: 'long' });
    const count = visibleCards.length;
    if (count === 0) return `${day} ${time} — caught up`;
    return `${day} ${time} — ${count} thing${count === 1 ? '' : 's'} on your plate`;
  }, [visibleCards.length]);

  const refreshControl = (
    <RefreshControl
      refreshing={scanning}
      onRefresh={() => void runScan()}
      tintColor={colors.purple}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.greetingWrap}>
        <Text style={styles.greeting}>{greeting}</Text>
      </View>

      {visibleCards.length === 0 ? (
        <ScrollView contentContainerStyle={styles.empty} refreshControl={refreshControl}>
          <Text style={styles.emptyIcon}>✓</Text>
          <Text style={styles.emptyTitle}>Caught up</Text>
          <Text style={styles.emptySub}>
            Nothing pulling at you right now. Pull down to refresh.
          </Text>
        </ScrollView>
      ) : (
        <FlatList
          data={restCards}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            heroCard ? (
              <ActionCard
                card={heroCard}
                mode="hero"
                onPrimaryAction={handlePrimary}
                onSecondaryAction={handleSecondary}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <ActionCard
              card={item}
              mode="compact"
              onPrimaryAction={handlePrimary}
              onSecondaryAction={handleSecondary}
              onDismiss={dismissAcrossSources}
              onSnooze={snoozeAcrossSources}
            />
          )}
          refreshControl={refreshControl}
          ListFooterComponent={<View style={{ height: 120 }} />}
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
  greetingWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  greeting: {
    ...typography.bodyMuted,
    fontSize: 15,
  },
  list: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  empty: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  emptyIcon: { fontSize: 52, color: colors.fyi },
  emptyTitle: typography.h2,
  emptySub: { ...typography.bodyMuted, textAlign: 'center' },
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
