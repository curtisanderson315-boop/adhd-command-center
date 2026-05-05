/**
 * ActionCard — the unified surface element for the v2 Now Feed.
 *
 * Two visual modes:
 *   - "hero":    full-width Now Card (~60% viewport), used for the single
 *                top-priority action.
 *   - "compact": feed entry below the hero. Swipe right snoozes 1hr; swipe
 *                left dismisses.
 *
 * Source-agnostic — props are just an ActionCard plus a primary tap handler
 * and (compact only) swipe handlers. Looks the same whether the underlying
 * source was voice, email, smart scan, or a manual task.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { ActionCard as ActionCardModel, ActionPayload, ActionUrgency } from '../types';
import { colors, spacing, radius, typography } from '../theme';

const URGENCY_COLOR: Record<ActionUrgency, string> = {
  now: colors.urgent,
  today: colors.actionNeeded,
  this_week: colors.purple,
  someday: colors.textMuted,
};

const URGENCY_LABEL: Record<ActionUrgency, string> = {
  now: 'Worth doing now',
  today: 'Worth doing today',
  this_week: 'This week',
  someday: 'Someday',
};

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ActionCardProps {
  card: ActionCardModel;
  mode: 'hero' | 'compact';
  onPrimaryAction: (card: ActionCardModel) => void;
  onSecondaryAction?: (card: ActionCardModel, action: ActionPayload) => void;
  onStartFocus?: (card: ActionCardModel) => void;
  /** Compact-only — fired when user swipes left to dismiss */
  onDismiss?: (card: ActionCardModel) => void;
  /** Compact-only — fired when user swipes right to snooze 1hr */
  onSnooze?: (card: ActionCardModel) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 110;

export function ActionCard({
  card,
  mode,
  onPrimaryAction,
  onSecondaryAction,
  onStartFocus,
  onDismiss,
  onSnooze,
}: ActionCardProps) {
  const translateX = useSharedValue(0);
  const itemHeight = useSharedValue(0);
  const opacity = useSharedValue(1);

  const isHero = mode === 'hero';
  const urgencyColor = URGENCY_COLOR[card.urgency];

  const animatedRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  // Background hint while swiping
  const animatedHintStyle = useAnimatedStyle(() => ({
    opacity: Math.min(Math.abs(translateX.value) / SWIPE_THRESHOLD, 1),
    backgroundColor:
      translateX.value > 0
        ? '#3a2a10' // amber tint for snooze (right swipe)
        : '#3a1010', // red tint for dismiss (left swipe)
  }));

  const fireDismiss = () => onDismiss?.(card);
  const fireSnooze = () => onSnooze?.(card);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      const absX = Math.abs(e.translationX);
      if (absX > SWIPE_THRESHOLD) {
        if (e.translationX < 0 && onDismiss) {
          translateX.value = withTiming(-500, { duration: 220 });
          opacity.value = withTiming(0, { duration: 220 }, () => {
            runOnJS(fireDismiss)();
          });
          return;
        }
        if (e.translationX > 0 && onSnooze) {
          translateX.value = withTiming(500, { duration: 220 });
          opacity.value = withTiming(0, { duration: 220 }, () => {
            runOnJS(fireSnooze)();
          });
          return;
        }
      }
      translateX.value = withTiming(0, { duration: 200 });
    });

  const cardBody = (
    <View
      style={[
        styles.card,
        isHero ? styles.cardHero : styles.cardCompact,
        { borderLeftColor: urgencyColor, borderLeftWidth: isHero ? 6 : 4 },
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.urgencyTag, { color: urgencyColor }]}>
          {URGENCY_LABEL[card.urgency]}
        </Text>
        {card.source !== 'manual' && (
          <Text style={styles.sourceTag}>{sourceTagLabel(card.source)}</Text>
        )}
      </View>

      <Text
        style={[styles.title, isHero ? styles.titleHero : styles.titleCompact]}
        numberOfLines={isHero ? 3 : 2}
      >
        {card.title}
      </Text>

      <Text
        style={[styles.context, isHero && styles.contextHero]}
        numberOfLines={isHero ? 4 : 2}
      >
        {card.context}
      </Text>

      {card.firstStep ? (
        <Text style={styles.firstStep} numberOfLines={isHero ? 3 : 2}>
          First step: {card.firstStep}
        </Text>
      ) : null}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[
            styles.primaryBtn,
            { backgroundColor: urgencyColor },
            isHero && styles.primaryBtnHero,
          ]}
          onPress={() => onPrimaryAction(card)}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>{card.primaryAction.label}</Text>
        </TouchableOpacity>

        {card.firstStep && onStartFocus ? (
          <TouchableOpacity
            style={styles.startBtn}
            onPress={() => onStartFocus(card)}
            activeOpacity={0.7}
          >
            <Text style={styles.startBtnText}>Start ▸</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {card.secondaryActions && card.secondaryActions.length > 0 ? (
        <View style={styles.secondaryRow}>
          {card.secondaryActions.slice(0, 2).map((sa, idx) => (
            <TouchableOpacity
              key={`${card.id}-sa-${idx}`}
              style={styles.secondaryBtn}
              onPress={() => onSecondaryAction?.(card, sa)}
            >
              <Text style={styles.secondaryBtnText}>{sa.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );

  if (isHero) {
    return <View style={styles.heroWrap}>{cardBody}</View>;
  }

  // Compact mode: wrap in swipe gesture + animated background hint
  return (
    <View
      style={styles.compactWrap}
      onLayout={(e) => {
        itemHeight.value = e.nativeEvent.layout.height;
      }}
    >
      <Animated.View style={[StyleSheet.absoluteFill, animatedHintStyle]} pointerEvents="none" />
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={animatedRowStyle}>
          <Pressable onPress={() => onPrimaryAction(card)}>{cardBody}</Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function sourceTagLabel(s: ActionCardModel['source']): string {
  switch (s) {
    case 'voice':
      return '🎙 Voice';
    case 'email':
      return '📥 Email';
    case 'smart_scan':
      return '✨ Scan';
    case 'calendar':
      return '📅 Calendar';
    default:
      return '';
  }
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  heroWrap: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  compactWrap: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    borderRadius: radius.lg,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderColor: colors.border,
    borderWidth: 1,
  },
  cardHero: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    minHeight: 240,
    backgroundColor: colors.bgCard,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardCompact: {
    minHeight: 96,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  urgencyTag: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sourceTag: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  title: {
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: 6,
  },
  titleHero: {
    fontSize: 24,
    lineHeight: 30,
  },
  titleCompact: {
    fontSize: 17,
    lineHeight: 22,
  },
  context: {
    ...typography.bodyMuted,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 20,
  },
  contextHero: {
    fontSize: 16,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  firstStep: {
    marginTop: spacing.sm,
    color: '#5BAA8D',
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 20,
  },
  actionRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  primaryBtnHero: {
    paddingVertical: 16,
    minHeight: 56,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  startBtn: {
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderColor: colors.border,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  startBtnText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  secondaryBtn: {
    paddingVertical: 4,
  },
  secondaryBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
