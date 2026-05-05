/**
 * BundleListView — list-pattern Bundle modal (replaces the sequential
 * stepper in BundleStack).
 *
 * Curtis's spec for v1.1:
 *   - LIST view as the entry point. Scrollable column of compact cards.
 *     Each row has title + context + [primary action button] + [dismiss].
 *   - TAP TO EXPAND IN PLACE. Animated height. Other rows stay compact.
 *     Tap header again to collapse. Expanded view shows firstStep,
 *     secondaryActions, related-email link.
 *   - ACTION + DISMISS work in both compact and expanded mode.
 *   - DISMISS lands the card in @adhd:archivedCards (via store.archiveCard).
 *     Bundle list filters archived cards out (they vanish from the list).
 *     The Undo banner pops globally so the user can take it back.
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { ActionCard as ActionCardModel, ActionPayload } from '../types';
import { colors, spacing, radius, typography } from '../theme';

export interface BundleListViewProps {
  visible: boolean;
  cards: ActionCardModel[];
  /** Caller runs the card's primaryAction. */
  onPrimary: (card: ActionCardModel) => void;
  /** Caller runs a secondary payload (drawer of additional actions). */
  onSecondary?: (card: ActionCardModel, payload: ActionPayload) => void;
  /** Caller archives the card (and pops the Undo banner). */
  onDismiss: (card: ActionCardModel) => void;
  onClose: () => void;
}

export function BundleListView({
  visible,
  cards,
  onPrimary,
  onSecondary,
  onDismiss,
  onClose,
}: BundleListViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const handleDismiss = (card: ActionCardModel) => {
    if (expandedId === card.id) setExpandedId(null);
    onDismiss(card);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Bundle</Text>
          <Text style={styles.count}>{cards.length}</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>

        {cards.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>✓</Text>
            <Text style={styles.emptyTitle}>All knocked out</Text>
            <Pressable style={styles.primaryBtn} onPress={onClose}>
              <Text style={styles.primaryBtnText}>Back to Now</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {cards.map((card) => (
              <BundleRow
                key={card.id}
                card={card}
                expanded={expandedId === card.id}
                onToggle={() => toggleExpand(card.id)}
                onPrimary={() => onPrimary(card)}
                onSecondary={onSecondary ? (p) => onSecondary(card, p) : undefined}
                onDismiss={() => handleDismiss(card)}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─── One row — compact by default, expands inline ──────────────────────────

interface BundleRowProps {
  card: ActionCardModel;
  expanded: boolean;
  onToggle: () => void;
  onPrimary: () => void;
  onSecondary?: (p: ActionPayload) => void;
  onDismiss: () => void;
}

function BundleRow({
  card,
  expanded,
  onToggle,
  onPrimary,
  onSecondary,
  onDismiss,
}: BundleRowProps) {
  const expandHeight = useSharedValue(0);

  React.useEffect(() => {
    expandHeight.value = withTiming(expanded ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded]);

  const expandStyle = useAnimatedStyle(() => ({
    opacity: expandHeight.value,
    maxHeight: expandHeight.value * 600, // generous upper bound for content
  }));

  return (
    <View style={styles.row}>
      <Pressable onPress={onToggle} style={styles.headerBlock} hitSlop={4}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {card.title}
          </Text>
          <Text style={styles.rowContext} numberOfLines={2}>
            {card.context}
          </Text>
        </View>
        <Text style={styles.chev}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.primaryActionBtn} onPress={onPrimary}>
          <Text style={styles.primaryActionText} numberOfLines={1}>
            {card.primaryAction.label}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dismissBtn}
          onPress={onDismiss}
          accessibilityLabel="Dismiss"
        >
          <Text style={styles.dismissIcon}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Inline expansion. Animated max-height + opacity. Stays in the
          same scroll position so the user sees it open immediately. */}
      <Animated.View style={[styles.expandBlock, expandStyle]} pointerEvents={expanded ? 'auto' : 'none'}>
        {card.firstStep ? (
          <Text style={styles.firstStep}>First step: {card.firstStep}</Text>
        ) : null}

        {card.relatedEmailIds && card.relatedEmailIds.length > 0 ? (
          <Text style={styles.related}>
            Related to {card.relatedEmailIds.length} email{card.relatedEmailIds.length === 1 ? '' : 's'}.
          </Text>
        ) : null}

        {card.secondaryActions && card.secondaryActions.length > 0 && onSecondary ? (
          <View style={styles.secondaryRow}>
            {card.secondaryActions.slice(0, 2).map((sa, idx) => (
              <Pressable
                key={`${card.id}-sa-${idx}`}
                onPress={() => onSecondary(sa)}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryText}>{sa.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingHorizontal: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  title: {
    ...typography.h2,
  },
  count: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.purple,
    backgroundColor: '#2a224a',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  closeBtn: {
    marginLeft: 'auto',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  closeText: {
    color: colors.purple,
    fontWeight: '700',
    fontSize: 16,
  },
  list: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  emptyEmoji: { fontSize: 56, color: colors.fyi },
  emptyTitle: typography.h2,
  primaryBtn: {
    backgroundColor: colors.purple,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  row: {
    backgroundColor: colors.bgCard,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  headerBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  rowContext: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  chev: {
    color: colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
    paddingTop: 2,
    paddingHorizontal: 4,
  },
  actionRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  primaryActionBtn: {
    flex: 1,
    backgroundColor: colors.purple,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  primaryActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  dismissBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissIcon: {
    color: colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  expandBlock: {
    marginTop: spacing.sm,
    overflow: 'hidden',
    gap: spacing.sm,
  },
  firstStep: {
    color: '#5BAA8D',
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 19,
  },
  related: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  secondaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: 4,
  },
  secondaryBtn: {
    paddingVertical: 4,
  },
  secondaryText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
