/**
 * SuggestionCard — single proactive suggestion in the Smart tab.
 *
 * Swipe left to dismiss. Tap the primary action button to act.
 * Urgency dot: red = high, amber = medium, green = low.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import type { SmartSuggestion, SuggestionAction } from '../types';
import { colors, spacing, radius } from '../theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 110;

const URGENCY_DOT: Record<SmartSuggestion['urgency'], string> = {
  high: '#E8524A',
  medium: '#D4A843',
  low: '#5BAA8D',
};

function actionLabel(action: SuggestionAction): string | null {
  switch (action.type) {
    case 'calendar':
      return 'Add to Calendar';
    case 'amazon':
      return 'Find on Amazon';
    case 'flights':
      return 'Search Flights';
    case 'draft_reply':
      return 'Draft Reply';
    case 'task':
      return 'Add to Tasks';
    case 'none':
    default:
      return null;
  }
}

interface Props {
  suggestion: SmartSuggestion;
  onAction: (suggestion: SmartSuggestion) => void | Promise<void>;
  onDismiss: (id: string) => void;
}

export function SuggestionCard({ suggestion, onAction, onDismiss }: Props) {
  const translateX = useSharedValue(0);
  const [busy, setBusy] = useState(false);

  const label = actionLabel(suggestion.action);
  const dotColor = URGENCY_DOT[suggestion.urgency];

  const handlePrimary = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onAction(suggestion);
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => onDismiss(suggestion.id);

  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onUpdate((e) => {
      // Only allow leftward swipe-to-dismiss
      translateX.value = Math.min(0, e.translationX);
    })
    .onEnd((e) => {
      if (e.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 220 }, () => {
          runOnJS(dismiss)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 20 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const dismissHintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <View style={styles.layer}>
      <Animated.View style={[styles.dismissHint, dismissHintStyle]}>
        <Text style={styles.dismissHintIcon}>✕</Text>
        <Text style={styles.dismissHintText}>Not relevant</Text>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={styles.row}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={2}>
                {suggestion.title}
              </Text>
              <Text style={styles.context} numberOfLines={2}>
                {suggestion.context}
              </Text>
            </View>
          </View>

          {label ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: dotColor }]}
              onPress={handlePrimary}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>{label}</Text>
              )}
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.ghostBtn} onPress={dismiss} disabled={busy}>
            <Text style={styles.ghostBtnText}>Not relevant</Text>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'relative',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 7,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 22,
  },
  context: {
    fontSize: 14,
    fontStyle: 'italic',
    color: colors.textSecondary,
    lineHeight: 19,
  },
  primaryBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing.xs,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  ghostBtn: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  ghostBtnText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  dismissHint: {
    position: 'absolute',
    top: '40%',
    right: 24,
    alignItems: 'center',
    zIndex: 0,
    gap: 4,
  },
  dismissHintIcon: {
    fontSize: 28,
    color: colors.textSecondary,
  },
  dismissHintText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
