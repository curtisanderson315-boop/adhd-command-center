import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { EmailPriority } from '../types';
import { colors, radius, spacing } from '../theme';

const CONFIG: Record<EmailPriority, { label: string; color: string; bg: string }> = {
  urgent:        { label: '🔴 Urgent',        color: colors.urgent,       bg: '#3d1218' },
  action_needed: { label: '🟡 Needs Action',  color: colors.actionNeeded, bg: '#3d2c10' },
  fyi:           { label: '🟢 FYI',           color: colors.fyi,          bg: '#0e3320' },
  noise:         { label: '⚫ Noise',          color: colors.noise,        bg: '#1e1e2e' },
};

interface Props {
  priority: EmailPriority;
}

export function PriorityBadge({ priority }: Props) {
  const cfg = CONFIG[priority];
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.label, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
});
