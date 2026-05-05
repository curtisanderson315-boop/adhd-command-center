/**
 * UndoBanner — Gmail-style global toast at the bottom of the screen.
 *
 * Rendered once at the App.tsx level so it's available from any tab. Any
 * call site can pop it with `requestUndoBanner({ message, onUndo })` from
 * src/services/undoBanner.ts. Auto-dismisses after 5s. Tapping Undo runs
 * the provided onUndo callback (typically `restoreCard(id)`) and closes.
 *
 * Anti-shame copy: the banner says "Dismissed: ..." not "Removed" — soft,
 * matter-of-fact. Tapping Undo doesn't apologize or congratulate.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { onUndoBannerRequest, type UndoBannerRequest } from '../services/undoBanner';
import { colors, spacing, radius } from '../theme';

const AUTO_DISMISS_MS = 5000;

export function UndoBanner() {
  const [active, setActive] = useState<UndoBannerRequest | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translateY = useSharedValue(120);
  const opacity = useSharedValue(0);

  // Subscribe once on mount.
  useEffect(() => {
    return onUndoBannerRequest((req) => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      setActive(req);
      translateY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
      opacity.value = withTiming(1, { duration: 220 });
      dismissTimer.current = setTimeout(() => {
        translateY.value = withTiming(120, { duration: 200 });
        opacity.value = withTiming(0, { duration: 200 }, () => {
          // (no cross-thread state set — handled below via timeout)
        });
        setTimeout(() => setActive(null), 220);
      }, AUTO_DISMISS_MS);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  const handleUndo = () => {
    if (!active) return;
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    try {
      void Promise.resolve(active.onUndo()).catch((e) =>
        console.warn('[UndoBanner] onUndo threw:', e)
      );
    } catch (e) {
      console.warn('[UndoBanner] onUndo sync threw:', e);
    }
    translateY.value = withTiming(120, { duration: 180 });
    opacity.value = withTiming(0, { duration: 180 });
    setTimeout(() => setActive(null), 180);
  };

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!active) return null;

  return (
    <Animated.View
      style={[styles.wrap, animStyle]}
      pointerEvents={active ? 'box-none' : 'none'}
    >
      <View style={styles.banner}>
        <Text style={styles.text} numberOfLines={2}>
          Dismissed: {active.message}
        </Text>
        <Pressable onPress={handleUndo} hitSlop={12} style={styles.undoBtn}>
          <Text style={styles.undoText}>Undo</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// Bottom of screen, above the iOS home-indicator and clear of the FAB
// (FAB sits at TAB_BAR_HEIGHT + 12; banner sits a bit higher when both
// are visible). Adjust right edge so the FAB doesn't sit on top of it.
const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md + 80, // leave clearance for the floating mic
    bottom: Platform.OS === 'ios' ? 110 : 88,
    zIndex: 1000,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  text: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  undoBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  undoText: {
    color: colors.purple,
    fontWeight: '700',
    fontSize: 15,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
