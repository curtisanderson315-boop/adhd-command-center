/**
 * AllScreen — the All tab. Replaces the legacy Tasks 3-bucket layout
 * with a SectionList grouped by ActionCard urgency.
 *
 * Three sections in order: Today (urgency in {now, today}), This Week
 * (urgency='this_week'), Later (urgency='someday'). Each header shows a
 * count. Sections auto-collapse if they have more than 5 items
 * (reduces overwhelm — opens with one tap).
 *
 * Data source is identical to NowFeed: project all sources to ActionCards,
 * merge persisted overlays, filter pending + due-snoozed, exclude
 * archived. NowFeed shows only Today; this screen shows the full
 * horizon.
 *
 * Route param `expandSection: 'today' | 'this_week' | 'later'` lets the
 * NowFeed footer link land here with the right section open.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  SafeAreaView,
  Pressable,
  Linking,
  Alert,
} from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { useAppStore } from '../store';
import { ActionCard } from '../components/ActionCard';
import { colors, spacing, radius, typography } from '../theme';
import {
  compareCards,
  mergeStoredOverlays,
  parseCardId,
  projectAllSources,
} from '../services/actionCards';
import { createDraft } from '../services/gmail';
import { createEvent } from '../services/calendar';
import { openAmazonSearch } from '../services/amazon';
import { getSavedEmail } from '../services/auth';
import { nanoid } from '../services/utils';
import type { ActionCard as ActionCardModel, ActionPayload, ActionUrgency } from '../types';

const SNOOZE_MS = 60 * 60 * 1000;
const AUTO_COLLAPSE_THRESHOLD = 5;

type SectionKey = 'today' | 'this_week' | 'later';

const SECTION_TITLES: Record<SectionKey, string> = {
  today: 'Today',
  this_week: 'This Week',
  later: 'Later',
};

const SECTION_EMPTY: Record<SectionKey, string> = {
  today: 'Caught up. Nothing pulling at you right now.',
  this_week: 'Nothing planned this week yet.',
  later: 'No long-haul stuff on your plate.',
};

function urgencySection(u: ActionUrgency): SectionKey {
  if (u === 'now' || u === 'today') return 'today';
  if (u === 'this_week') return 'this_week';
  return 'later';
}

type AllRoute = RouteProp<{ All: { expandSection?: SectionKey } | undefined }, 'All'>;

export function AllScreen() {
  const route = useRoute<AllRoute>();
  const requestedExpand = route.params?.expandSection;

  const captures = useAppStore((s) => s.captures);
  const tasks = useAppStore((s) => s.tasks);
  const triageQueue = useAppStore((s) => s.triageQueue);
  const suggestions = useAppStore((s) => s.suggestions);
  const storedCards = useAppStore((s) => s.actionCards);
  const archivedCards = useAppStore((s) => s.archivedCards);
  const settings = useAppStore((s) => s.settings);

  const updateCapture = useAppStore((s) => s.updateCapture);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const removeFromTriage = useAppStore((s) => s.removeFromTriage);
  const actionSuggestion = useAppStore((s) => s.actionSuggestion);
  const addTask = useAppStore((s) => s.addTask);
  const markCardStatus = useAppStore((s) => s.markCardStatus);
  const upsertCard = useAppStore((s) => s.upsertCard);
  const snoozeCard = useAppStore((s) => s.snoozeCard);

  // Sections start expanded by default; auto-collapse on first render
  // for any section with > AUTO_COLLAPSE_THRESHOLD cards. The user can
  // tap a header to toggle either way after that.
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean | null>>({
    today: null,
    this_week: null,
    later: null,
  });

  // ── Project sources, filter, group ──────────────────────────────────────
  const visibleCards = useMemo(() => {
    const projected = projectAllSources({ captures, tasks, triageQueue, suggestions });
    const merged = mergeStoredOverlays(projected, storedCards);
    const archivedIds = new Set(archivedCards.map((c) => c.id));
    const now = Date.now();
    return merged
      .filter((c) => !archivedIds.has(c.id))
      .filter((c) => {
        if (c.status === 'pending') return true;
        if (c.status === 'snoozed' && c.snoozeUntil) {
          return new Date(c.snoozeUntil).getTime() < now;
        }
        return false;
      })
      .sort(compareCards);
  }, [captures, tasks, triageQueue, suggestions, storedCards, archivedCards]);

  const grouped: Record<SectionKey, ActionCardModel[]> = useMemo(() => {
    const out: Record<SectionKey, ActionCardModel[]> = {
      today: [],
      this_week: [],
      later: [],
    };
    for (const c of visibleCards) {
      out[urgencySection(c.urgency)].push(c);
    }
    return out;
  }, [visibleCards]);

  // Effective collapse state: if user hasn't toggled (null), apply the
  // auto-collapse rule. If user has toggled (boolean), respect that.
  const effectiveCollapsed = useCallback(
    (key: SectionKey) => {
      const userPref = collapsed[key];
      if (userPref !== null) return userPref;
      // Auto-rule: collapsed if > threshold, OR if the route param explicitly
      // asks to expand a different section (then collapse the others).
      if (requestedExpand && requestedExpand !== key) return true;
      return grouped[key].length > AUTO_COLLAPSE_THRESHOLD;
    },
    [collapsed, grouped, requestedExpand]
  );

  // Reset user-toggle state when the screen regains focus from a deep
  // link with expandSection — fresh state honors the new request.
  useFocusEffect(
    useCallback(() => {
      if (requestedExpand) {
        setCollapsed({ today: null, this_week: null, later: null });
      }
    }, [requestedExpand])
  );

  const toggleSection = (key: SectionKey) => {
    setCollapsed((cur) => ({ ...cur, [key]: !effectiveCollapsed(key) }));
  };

  // ── Source-aware mark-done router (parity with HomeScreen) ──────────────
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
        default:
          await markCardStatus(card.id, 'done');
      }
    },
    [updateCapture, toggleTask, removeFromTriage, actionSuggestion, markCardStatus]
  );

  const performPayload = useCallback(
    async (card: ActionCardModel, payload: ActionPayload) => {
      try {
        switch (payload.kind) {
          case 'open_url':
            await Linking.openURL(payload.url);
            await markDoneAcrossSources(card);
            return;
          case 'reorder_amazon':
            if (payload.asin) {
              await Linking.openURL(`https://www.amazon.com/dp/${payload.asin}`);
            } else {
              await openAmazonSearch(payload.query);
            }
            await markDoneAcrossSources(card);
            return;
          case 'create_calendar': {
            const dateStr = payload.event.date ?? new Date().toISOString();
            const startDate = new Date(dateStr);
            if (isNaN(startDate.getTime())) return;
            await createEvent({
              title: payload.event.title,
              startDate,
              durationMinutes: payload.event.durationMinutes ?? 60,
              notes: payload.event.notes ?? null,
            });
            await markDoneAcrossSources(card);
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
            return;
          }
          case 'add_task':
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
            return;
          case 'mark_done':
            await markDoneAcrossSources(card);
            return;
          case 'snooze': {
            const until = new Date(Date.now() + SNOOZE_MS).toISOString();
            await upsertCard({ ...card, status: 'snoozed', snoozeUntil: until });
            await snoozeCard(card.id, until);
            return;
          }
        }
      } catch (e: any) {
        Alert.alert("Couldn't do that", e?.message ?? 'Try again in a moment.');
      }
    },
    [markDoneAcrossSources, addTask, settings.userEmail, upsertCard, snoozeCard]
  );

  const handlePrimary = useCallback(
    (card: ActionCardModel) => void performPayload(card, card.primaryAction),
    [performPayload]
  );
  const handleSecondary = useCallback(
    (card: ActionCardModel, p: ActionPayload) => void performPayload(card, p),
    [performPayload]
  );

  // ── Render ──────────────────────────────────────────────────────────────
  // Collapsed sections show their header only — the data array is empty.
  const sections = (['today', 'this_week', 'later'] as SectionKey[]).map((key) => ({
    key,
    title: SECTION_TITLES[key],
    count: grouped[key].length,
    isCollapsed: effectiveCollapsed(key),
    data: effectiveCollapsed(key) ? [] : grouped[key],
  }));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>All</Text>
        <Text style={styles.headerSub}>By time horizon</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(c) => c.id}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => {
          const s = section as (typeof sections)[number];
          return (
            <Pressable
              onPress={() => toggleSection(s.key)}
              style={styles.sectionHeader}
              hitSlop={4}
            >
              <Text style={styles.sectionChev}>{s.isCollapsed ? '▸' : '▾'}</Text>
              <Text style={styles.sectionTitle}>{s.title}</Text>
              <Text style={styles.sectionCount}>{s.count}</Text>
            </Pressable>
          );
        }}
        renderItem={({ item }) => (
          <ActionCard
            card={item}
            mode="compact"
            onPrimaryAction={handlePrimary}
            onSecondaryAction={handleSecondary}
          />
        )}
        renderSectionFooter={({ section }) => {
          const s = section as (typeof sections)[number];
          if (s.count === 0 && !s.isCollapsed) {
            return (
              <View style={styles.emptyFooter}>
                <Text style={styles.emptyText}>{SECTION_EMPTY[s.key]}</Text>
              </View>
            );
          }
          return null;
        }}
        ListFooterComponent={<View style={{ height: 120 }} />}
      />
    </SafeAreaView>
  );
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg,
  },
  sectionChev: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: '700',
    width: 16,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.purple,
    backgroundColor: '#2a224a',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: radius.full,
    overflow: 'hidden',
    minWidth: 28,
    textAlign: 'center',
  },
  emptyFooter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  emptyText: {
    ...typography.bodyMuted,
    fontStyle: 'italic',
    fontSize: 14,
  },
});
