import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { EmailPriority } from '../types';
import { colors, radius, spacing } from '../theme';

// Anti-shame copy: "Urgent" pressures, "Worth doing today" invites.
// "Noise" judges; "Skip-able" is honest.
const CONFIG: Record<EmailPriority, { label: string; color: string; bg: string }> = {
  urgent:        { label: '🔴 Worth doing today', color: colors.urgent,       bg: '#3d1218' },
  action_needed: { label: '🟡 Worth a reply',     color: colors.actionNeeded, bg: '#3d2c10' },
  fyi:           { label: '🟢 Just so you know',  color: colors.fyi,          bg: '#0e3320' },
  noise:         { label: '⚫ Skip-able',          color: colors.noise,        bg: '#1e1e2e' },
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
