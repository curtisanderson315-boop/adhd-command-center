/**
 * Home Screen — capture feed + pinned pending items
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useAppStore } from '../store';
import { CaptureBar } from '../components/CaptureBar';
import { colors, spacing, radius, typography } from '../theme';
import { relativeTime } from '../services/utils';
import type { CapturedAction } from '../types';

const ACTION_ICON: Record<string, string> = {
  calendar_event: '📅',
  gmail_draft: '✉️',
  task: '✅',
  note: '📝',
};

const PRIORITY_COLOR: Record<string, string> = {
  high: colors.urgent,
  medium: colors.actionNeeded,
  low: colors.textMuted,
};

function CaptureItem({
  item,
  onDismiss,
}: {
  item: CapturedAction;
  onDismiss: (id: string) => void;
}) {
  return (
    <View style={[styles.card, item.status === 'pending' && styles.cardPending]}>
      <View style={styles.cardHeader}>
        <Text style={styles.icon}>{ACTION_ICON[item.type]}</Text>
        <View style={styles.cardMeta}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.cardTime}>{relativeTime(item.createdAt)}</Text>
        </View>
        <View
          style={[
            styles.priorityDot,
            { backgroundColor: PRIORITY_COLOR[item.priority] },
          ]}
        />
      </View>

      {item.needsClarification && (
        <View style={styles.clarificationBanner}>
          <Text style={styles.clarificationText}>
            ⚠️  {item.needsClarification}
          </Text>
        </View>
      )}

      {item.routedTo && (
        <Text style={styles.routedTag}>→ {item.routedTo}</Text>
      )}

      {item.status === 'pending' && (
        <TouchableOpacity
          style={styles.dismissBtn}
          onPress={() => onDismiss(item.id)}
        >
          <Text style={styles.dismissText}>Dismiss</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function HomeScreen() {
  const { captures, updateCapture } = useAppStore();

  const pending = captures.filter((c) => c.status === 'pending');
  const rest = captures.filter((c) => c.status !== 'pending');

  const handleDismiss = (id: string) => {
    updateCapture(id, { status: 'dismissed' });
  };

  const sections: Array<{ id: string; isHeader?: boolean; title?: string; item?: CapturedAction }> = [];

  if (pending.length > 0) {
    sections.push({ id: 'h-pending', isHeader: true, title: 'NEEDS ATTENTION' });
    pending.forEach((c) => sections.push({ id: c.id, item: c }));
  }

  if (rest.length > 0) {
    sections.push({ id: 'h-recent', isHeader: true, title: 'RECENT CAPTURES' });
    rest.forEach((c) => sections.push({ id: c.id, item: c }));
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Command Center</Text>
        <Text style={styles.headerSub}>
          {pending.length > 0
            ? `${pending.length} item${pending.length > 1 ? 's' : ''} need attention`
            : 'All clear'}
        </Text>
      </View>

      {sections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🎙</Text>
          <Text style={styles.emptyTitle}>Tap the mic to capture a thought</Text>
          <Text style={styles.emptySub}>
            Say anything — I'll figure out whether it's a task, calendar event, or email.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: section }) => {
            if (section.isHeader) {
              return <Text style={styles.sectionHeader}>{section.title}</Text>;
            }
            return (
              <CaptureItem item={section.item!} onDismiss={handleDismiss} />
            );
          }}
        />
      )}

      <CaptureBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    ...typography.h1,
    marginBottom: 4,
  },
  headerSub: {
    ...typography.bodyMuted,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  sectionHeader: {
    ...typography.label,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPending: {
    borderColor: colors.purpleDim,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  icon: {
    fontSize: 22,
    marginTop: 2,
  },
  cardMeta: {
    flex: 1,
  },
  cardTitle: {
    ...typography.body,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardTime: {
    ...typography.caption,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  clarificationBanner: {
    marginTop: spacing.sm,
    backgroundColor: '#2a1f10',
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  clarificationText: {
    color: colors.actionNeeded,
    fontSize: 13,
  },
  routedTag: {
    marginTop: spacing.sm,
    ...typography.caption,
    color: colors.fyi,
  },
  dismissBtn: {
    marginTop: spacing.sm,
    alignSelf: 'flex-end',
  },
  dismissText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyIcon: {
    fontSize: 52,
  },
  emptyTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  emptySub: {
    ...typography.bodyMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
