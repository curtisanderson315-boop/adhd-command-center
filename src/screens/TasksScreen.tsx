import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useAppStore } from '../store';
import { colors, spacing, radius, typography } from '../theme';
import type { Task, TaskBucket } from '../types';

const BUCKETS: { key: TaskBucket; label: string; icon: string }[] = [
  { key: 'today', label: 'Today', icon: '⚡' },
  { key: 'upcoming', label: 'Upcoming', icon: '📆' },
  { key: 'someday', label: 'Someday', icon: '🌙' },
];

const PRIORITY_COLOR = {
  high: colors.urgent,
  medium: colors.actionNeeded,
  low: colors.textMuted,
};

function TaskItem({ task, onToggle, onDelete }: { task: Task; onToggle: () => void; onDelete: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.taskCard, task.completed && styles.taskCardDone]}
      onPress={onToggle}
      onLongPress={() =>
        Alert.alert('Delete task?', task.title, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: onDelete },
        ])
      }
    >
      <View
        style={[
          styles.checkbox,
          task.completed && styles.checkboxDone,
          { borderColor: PRIORITY_COLOR[task.priority] },
        ]}
      >
        {task.completed && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <View style={styles.taskContent}>
        <Text style={[styles.taskTitle, task.completed && styles.taskTitleDone]}>
          {task.title}
        </Text>
        {task.notes ? (
          <Text style={styles.taskNotes} numberOfLines={1}>{task.notes}</Text>
        ) : null}
      </View>
      <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[task.priority] }]} />
    </TouchableOpacity>
  );
}

export function TasksScreen() {
  const { tasks, toggleTask, removeTask } = useAppStore();
  const [activeBucket, setActiveBucket] = useState<TaskBucket>('today');

  const filtered = tasks.filter((t) => t.bucket === activeBucket);
  const incomplete = filtered.filter((t) => !t.completed);
  const complete = filtered.filter((t) => t.completed);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tasks</Text>
        <Text style={styles.headerSub}>
          {incomplete.length} remaining
        </Text>
      </View>

      {/* Bucket tabs */}
      <View style={styles.tabs}>
        {BUCKETS.map((b) => {
          const count = tasks.filter((t) => t.bucket === b.key && !t.completed).length;
          return (
            <TouchableOpacity
              key={b.key}
              style={[styles.tab, activeBucket === b.key && styles.tabActive]}
              onPress={() => setActiveBucket(b.key)}
            >
              <Text style={styles.tabIcon}>{b.icon}</Text>
              <Text style={[styles.tabLabel, activeBucket === b.key && styles.tabLabelActive]}>
                {b.label}
              </Text>
              {count > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={[...incomplete, ...complete]}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyText}>Nothing here. Say something to the mic!</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TaskItem
            task={item}
            onToggle={() => toggleTask(item.id)}
            onDelete={() => removeTask(item.id)}
          />
        )}
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
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    borderColor: colors.purple,
    backgroundColor: '#1e1a3a',
  },
  tabIcon: { fontSize: 16 },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabLabelActive: { color: colors.purple },
  badge: {
    backgroundColor: colors.purple,
    borderRadius: radius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  taskCardDone: { opacity: 0.5 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxDone: {
    backgroundColor: colors.fyi,
    borderColor: colors.fyi,
  },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  taskContent: { flex: 1 },
  taskTitle: {
    ...typography.body,
    fontWeight: '600',
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  taskNotes: { ...typography.caption, marginTop: 2 },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  empty: {
    paddingTop: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyIcon: { fontSize: 40 },
  emptyText: { ...typography.bodyMuted, textAlign: 'center' },
});
