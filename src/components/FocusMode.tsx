/**
 * FocusMode — full-bleed black overlay for one-task-at-a-time work sessions.
 *
 * Triggered from any ActionCard's "Start" button when a firstStep is set.
 * Notifications are silenced for the duration; restored on exit. A 25-min
 * Pomodoro timer counts down. Tapping DONE marks the underlying card complete.
 *
 * SVG note: react-native-svg is not in the dep tree (would require a native
 * rebuild). The "ring" from the spec is rendered via two clipped half-circles
 * with reanimated rotation transforms — visually the same outcome as an SVG
 * stroke-dashoffset animation, no native dep added.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
  Easing,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated';
import type { ActionCard as ActionCardModel } from '../types';
import { colors, spacing, radius } from '../theme';

const SESSION_MS = 25 * 60 * 1000; // 25 minute Pomodoro
const RING_SIZE = 280;
const RING_THICKNESS = 14;

// ─── Notifications: silence for the focus session, restore on exit ────────

const QUIET_HANDLER: Parameters<typeof Notifications.setNotificationHandler>[0] = {
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldShowBanner: false,
    shouldShowList: true, // still log to notification center, just don't surface
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
};

const LOUD_HANDLER: Parameters<typeof Notifications.setNotificationHandler>[0] = {
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
};

// ─── Props ─────────────────────────────────────────────────────────────────

export interface FocusModeProps {
  visible: boolean;
  card: ActionCardModel | null;
  /** Called when user taps DONE — caller marks the card complete. */
  onDone: (card: ActionCardModel) => void;
  /** Called when user dismisses the overlay (Pause/back). */
  onClose: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function FocusMode({ visible, card, onDone, onClose }: FocusModeProps) {
  const [remainingMs, setRemainingMs] = useState(SESSION_MS);
  const [paused, setPaused] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const elapsedBeforePauseRef = useRef<number>(0);

  // Reanimated progress value 0 → 1 over the session
  const progress = useSharedValue(0);

  // ── Lifecycle: silence notifications, start ticking ────────────────────
  useEffect(() => {
    if (!visible) return;
    Notifications.setNotificationHandler(QUIET_HANDLER);

    elapsedBeforePauseRef.current = 0;
    startedAtRef.current = Date.now();
    setRemainingMs(SESSION_MS);
    setPaused(false);

    progress.value = 0;
    progress.value = withTiming(1, {
      duration: SESSION_MS,
      easing: Easing.linear,
    });

    tickRef.current = setInterval(() => {
      const elapsed = elapsedBeforePauseRef.current + (Date.now() - startedAtRef.current);
      const left = Math.max(0, SESSION_MS - elapsed);
      setRemainingMs(left);
      if (left <= 0 && tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    }, 250);

    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      cancelAnimation(progress);
      Notifications.setNotificationHandler(LOUD_HANDLER);
    };
  }, [visible]);

  // ── Pause / Resume ──────────────────────────────────────────────────────
  const togglePause = useCallback(() => {
    if (paused) {
      // resume
      startedAtRef.current = Date.now();
      progress.value = withTiming(1, {
        duration: Math.max(remainingMs, 1),
        easing: Easing.linear,
      });
      setPaused(false);
    } else {
      // pause
      elapsedBeforePauseRef.current += Date.now() - startedAtRef.current;
      cancelAnimation(progress);
      setPaused(true);
    }
  }, [paused, remainingMs, progress]);

  const handleDone = useCallback(() => {
    if (card) onDone(card);
    onClose();
  }, [card, onDone, onClose]);

  // ── Ring animation ──────────────────────────────────────────────────────
  // Two half-rings: each rotates from -180° → 0° as progress goes 0 → 0.5,
  // then 0° → 0° while progress goes 0.5 → 1. Together they "fill" the ring.
  const firstHalfStyle = useAnimatedStyle(() => {
    const p = Math.min(progress.value * 2, 1);
    const rot = interpolate(p, [0, 1], [-180, 0], Extrapolate.CLAMP);
    return { transform: [{ rotateZ: `${rot}deg` }] };
  });

  const secondHalfVisible = useAnimatedStyle(() => ({
    opacity: progress.value > 0.5 ? 1 : 0,
  }));

  const secondHalfStyle = useAnimatedStyle(() => {
    const p = Math.max((progress.value - 0.5) * 2, 0);
    const rot = interpolate(p, [0, 1], [-180, 0], Extrapolate.CLAMP);
    return { transform: [{ rotateZ: `${rot}deg` }] };
  });

  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  const timeLabel = `${mins}:${secs.toString().padStart(2, '0')}`;

  if (!card) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
      <RNStatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.container}>
        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>
          {card.title}
        </Text>

        {/* Step + ring + DONE */}
        <View style={styles.center}>
          {card.firstStep ? (
            <Text style={styles.step}>{card.firstStep}</Text>
          ) : (
            <Text style={styles.step}>{card.context}</Text>
          )}

          <View style={styles.ringWrap}>
            {/* Background ring */}
            <View style={styles.ringBg} />

            {/* Progress halves — each is a clipped semicircle that rotates */}
            <View style={styles.halfClipLeft}>
              <Animated.View style={[styles.halfArc, styles.halfArcLeft, firstHalfStyle]} />
            </View>
            <Animated.View style={[styles.halfClipRight, secondHalfVisible]}>
              <Animated.View style={[styles.halfArc, styles.halfArcRight, secondHalfStyle]} />
            </Animated.View>

            {/* Center DONE button + remaining time */}
            <Pressable style={styles.doneBtn} onPress={handleDone} hitSlop={20}>
              <Text style={styles.doneText}>DONE</Text>
              <Text style={styles.timeText}>{timeLabel}</Text>
            </Pressable>
          </View>

          <View style={styles.linksRow}>
            <Pressable onPress={togglePause} hitSlop={12}>
              <Text style={styles.link}>{paused ? 'Resume' : 'Pause'}</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.link}>Skip step</Text>
            </Pressable>
          </View>
        </View>

        {/* Tiny exit hint at bottom — discoverability without clutter */}
        <Pressable onPress={onClose} style={styles.exitWrap} hitSlop={12}>
          <Text style={styles.exitText}>Exit focus</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingHorizontal: spacing.lg,
    alignItems: 'stretch',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  step: {
    color: '#cfcfdc',
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringBg: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_THICKNESS,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  // The "left half" clip — only the left side of the ring is visible inside
  halfClipLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: RING_SIZE / 2,
    height: RING_SIZE,
    overflow: 'hidden',
  },
  halfClipRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: RING_SIZE / 2,
    height: RING_SIZE,
    overflow: 'hidden',
  },
  // The arc itself — drawn as a full circle with two transparent borders.
  // Rotated inside its clip to reveal a sweeping arc.
  halfArc: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_THICKNESS,
    borderColor: 'transparent',
  },
  halfArcLeft: {
    // anchor at right edge of clip so rotation pivots correctly
    left: 0,
    borderTopColor: colors.purple,
    borderLeftColor: colors.purple,
  },
  halfArcRight: {
    right: 0,
    borderTopColor: colors.purple,
    borderRightColor: colors.purple,
  },
  doneBtn: {
    width: RING_SIZE - 80,
    height: RING_SIZE - 80,
    borderRadius: (RING_SIZE - 80) / 2,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.purple,
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  doneText: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 2,
  },
  timeText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  linksRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  link: {
    color: '#cfcfdc',
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  exitWrap: {
    alignSelf: 'center',
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  exitText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
});
