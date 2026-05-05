/**
 * BundleStack — focused-stack modal for knocking out a cluster of same-shape
 * actions one at a time. The ADHD answer to context-switching: do all the
 * purchases in one sprint, all the replies in one sprint, etc.
 *
 * Same UI primitive as FocusMode (full-bleed modal, central card, big
 * actions) but stepping through cards instead of through steps within a
 * single card.
 */

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Platform, ScrollView } from 'react-native';
import type { ActionCard as ActionCardModel } from '../types';
import { colors, spacing, radius, typography } from '../theme';

export interface BundleStackProps {
  visible: boolean;
  cards: ActionCardModel[];
  /** Tap "Do this" → caller runs the card's primaryAction. */
  onDo: (card: ActionCardModel) => void;
  /** Tap "Skip" → caller silently advances (does NOT mark done). */
  onSkip?: (card: ActionCardModel) => void;
  onClose: () => void;
}

export function BundleStack({ visible, cards, onDo, onSkip, onClose }: BundleStackProps) {
  const [index, setIndex] = useState(0);

  // Reset to first card whenever the bundle is reopened
  useEffect(() => {
    if (visible) setIndex(0);
  }, [visible]);

  if (!visible) return null;
  const card = cards[index] ?? null;
  if (!card) {
    // Bundle exhausted — auto-close
    return (
      <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.container}>
          <View style={styles.doneCard}>
            <Text style={styles.emoji}>✓</Text>
            <Text style={styles.doneTitle}>All knocked out</Text>
            <Pressable style={styles.primaryBtn} onPress={onClose}>
              <Text style={styles.primaryBtnText}>Back to Now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  const advance = () => setIndex((i) => i + 1);

  const handleDo = () => {
    onDo(card);
    advance();
  };

  const handleSkip = () => {
    onSkip?.(card);
    advance();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.progress}>
            {index + 1} of {cards.length}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.exitText}>Exit</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollBody}>
          <View style={styles.card}>
            <Text style={styles.tag}>{labelForKind(card.primaryAction.kind)}</Text>
            <Text style={styles.title}>{card.title}</Text>
            <Text style={styles.context}>{card.context}</Text>
            {card.firstStep ? (
              <Text style={styles.firstStep}>First step: {card.firstStep}</Text>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.actionsRow}>
          <Pressable style={styles.skipBtn} onPress={handleSkip} hitSlop={8}>
            <Text style={styles.skipBtnText}>Skip</Text>
          </Pressable>
          <Pressable style={styles.doBtn} onPress={handleDo} hitSlop={8}>
            <Text style={styles.doBtnText}>{card.primaryAction.label} ▸</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function labelForKind(kind: string): string {
  switch (kind) {
    case 'reorder_amazon':
      return 'Purchase';
    case 'create_calendar':
      return 'Calendar';
    case 'create_draft':
      return 'Reply';
    case 'add_task':
      return 'Task';
    case 'open_url':
      return 'Open link';
    case 'mark_done':
      return 'Quick action';
    default:
      return '';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b18',
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.md,
  },
  progress: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  exitText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  scrollBody: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderColor: colors.border,
    borderWidth: 1,
    minHeight: 280,
  },
  tag: {
    color: colors.purple,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 34,
    marginBottom: spacing.md,
  },
  context: {
    ...typography.bodyMuted,
    fontSize: 17,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  firstStep: {
    marginTop: spacing.md,
    color: '#5BAA8D',
    fontStyle: 'italic',
    fontSize: 16,
    lineHeight: 22,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  skipBtn: {
    paddingVertical: 16,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  doBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  doneCard: {
    margin: spacing.xl,
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  emoji: { fontSize: 56, color: colors.fyi },
  doneTitle: typography.h2,
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
});
