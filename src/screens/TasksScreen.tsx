/**
 * Tasks Screen — three buckets, swipe-to-complete, swipe-to-delete, quick-add modal.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Modal,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
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
import { useAppStore } from '../store';
import { colors, spacing, radius, typography } from '../theme';
import { nanoid } from '../services/utils';
import type { Task, TaskBucket } from '../types';

const BUCKETS: { key: TaskBucket; label: string; icon: string }[] = [
  { key: 'today', label: 'Today', icon: '⚡' },
  { key: 'upcoming', label: 'Upcoming', icon: '📆' },
  { key: 'someday', label: 'Someday', icon: '🌙' },
];

const PRIORITY_COLOR: Record<Task['priority'], string> = {
  high: colors.urgent,
  medium: colors.actionNeeded,
  low: colors.fyi,
};

const PRIORITY_ORDER: Record<Task['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const PRIORITY_LABEL: Record<Task['priority'], string> = {
  high: '🔴',
  medium: '🟡',
  low: '🟢',
};

const SWIPE_THRESHOLD = 90;

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

// ─── Swipeable task row ────────────────────────────────────────────────

interface RowProps {
  task: Task;
  onToggle: () => void;
  onDelete: () => void;
}

function SwipeableTaskRow({ task, onToggle, onDelete }: RowProps) {
  const translateX = useSharedValue(0);
  const completionScale = useSharedValue(task.completed ? 1 : 0);

  const triggerToggle = useCallback(() => {
    completionScale.value = withSpring(task.completed ? 0 : 1, {
      damping: 12,
      stiffness: 180,
    });
    onToggle();
  }, [task.completed, onToggle]);

  const triggerDelete = useCallback(() => {
    onDelete();
  }, [onDelete]);

  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_THRESHOLD) {
        // Swipe right → complete
        translateX.value = withTiming(40, { duration: 180 }, () => {
          translateX.value = withSpring(0);
        });
        runOnJS(triggerToggle)();
      } else if (e.translationX < -SWIPE_THRESHOLD) {
        // Swipe left → delete
        translateX.value = withTiming(-400, { duration: 200 }, () => {
          runOnJS(triggerDelete)();
        });
      } else {
        translateX.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const completeBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const deleteBgStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  const checkboxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.8 + completionScale.value * 0.4 }],
    backgroundColor: completionScale.value > 0.5 ? colors.fyi : 'transparent',
  }));

  return (
    <View style={styles.rowOuter}>
      <Animated.View style={[styles.swipeBg, styles.swipeBgComplete, completeBgStyle]}>
        <Text style={styles.swipeBgIcon}>✓</Text>
      </Animated.View>
      <Animated.View style={[styles.swipeBg, styles.swipeBgDelete, deleteBgStyle]}>
        <Text style={styles.swipeBgIcon}>🗑</Text>
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={cardStyle}>
          <Pressable
            style={[styles.taskCard, task.completed && styles.taskCardDone]}
            onPress={triggerToggle}
          >
            <Animated.View
              style={[
                styles.checkbox,
                { borderColor: PRIORITY_COLOR[task.priority] },
                checkboxStyle,
              ]}
            >
              {task.completed && <Text style={styles.checkmark}>✓</Text>}
            </Animated.View>
            <View style={styles.taskContent}>
              <Text style={[styles.taskTitle, task.completed && styles.taskTitleDone]}>
                {task.title}
              </Text>
              {task.notes ? (
                <Text style={styles.taskNotes} numberOfLines={1}>
                  {task.notes}
                </Text>
              ) : null}
            </View>
            <View
              style={[
                styles.priorityDot,
                { backgroundColor: PRIORITY_COLOR[task.priority] },
              ]}
            />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ─── Quick add modal ───────────────────────────────────────────────────

interface QuickAddProps {
  visible: boolean;
  defaultBucket: TaskBucket;
  onClose: () => void;
  onCreate: (task: Task) => void;
}

function QuickAddModal({ visible, defaultBucket, onClose, onCreate }: QuickAddProps) {
  const [title, setTitle] = useState('');
  const [bucket, setBucket] = useState<TaskBucket>(defaultBucket);
  const [priority, setPriority] = useState<Task['priority']>('medium');
  const inputRef = useRef<TextInput>(null);

  const reset = () => {
    setTitle('');
    setBucket(defaultBucket);
    setPriority('medium');
  };

  const cyclePriority = () => {
    const next: Record<Task['priority'], Task['priority']> = {
      low: 'medium',
      medium: 'high',
      high: 'low',
    };
    setPriority((p) => next[p]);
  };

  const handleCreate = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onCreate({
      id: nanoid(),
      title: trimmed,
      bucket,
      priority,
      completed: false,
      createdAt: new Date().toISOString(),
    });
    reset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onShow={() => setTimeout(() => inputRef.current?.focus(), 100)}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalRoot}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>New task</Text>

          <TextInput
            ref={inputRef}
            style={styles.modalInput}
            placeholder="What needs doing?"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={handleCreate}
            returnKeyType="done"
            multiline
          />

          <Text style={styles.modalLabel}>WHEN</Text>
          <View style={styles.bucketPicker}>
            {BUCKETS.map((b) => {
              const active = bucket === b.key;
              return (
                <TouchableOpacity
                  key={b.key}
                  style={[styles.bucketOption, active && styles.bucketOptionActive]}
                  onPress={() => setBucket(b.key)}
                >
                  <Text style={styles.bucketOptionIcon}>{b.icon}</Text>
                  <Text
                    style={[
                      styles.bucketOptionLabel,
                      active && styles.bucketOptionLabelActive,
                    ]}
                  >
                    {b.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.modalRow}>
            <Text style={styles.modalLabel}>PRIORITY</Text>
            <TouchableOpacity onPress={cyclePriority} style={styles.priorityChip}>
              <Text style={styles.priorityChipText}>
                {PRIORITY_LABEL[priority]} {priority[0].toUpperCase() + priority.slice(1)}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity onPress={onClose} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCreate}
              style={[styles.modalCreateBtn, !title.trim() && styles.modalCreateBtnDisabled]}
              disabled={!title.trim()}
            >
              <Text style={styles.modalCreateText}>Add task</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────

export function TasksScreen() {
  const { tasks, toggleTask, removeTask, addTask } = useAppStore();
  const [activeBucket, setActiveBucket] = useState<TaskBucket>('today');
  const [addOpen, setAddOpen] = useState(false);

  const filtered = sortTasks(tasks.filter((t) => t.bucket === activeBucket));
  const incompleteCount = filtered.filter((t) => !t.completed).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Tasks</Text>
          <Text style={styles.headerSub}>
            {incompleteCount === 0
              ? 'Nothing left in this bucket'
              : `${incompleteCount} remaining`}
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddOpen(true)}>
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {BUCKETS.map((b) => {
          const count = tasks.filter((t) => t.bucket === b.key && !t.completed).length;
          const active = activeBucket === b.key;
          return (
            <TouchableOpacity
              key={b.key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setActiveBucket(b.key)}
            >
              <Text style={styles.tabIcon}>{b.icon}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
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
        data={filtered}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>Nothing in {BUCKETS.find((b) => b.key === activeBucket)?.label}.</Text>
            <Text style={styles.emptyText}>
              Tap + to add a task, or hold the mic to speak one.
            </Text>
            <TouchableOpacity style={styles.emptyAction} onPress={() => setAddOpen(true)}>
              <Text style={styles.emptyActionText}>Add a task</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <SwipeableTaskRow
            task={item}
            onToggle={() => toggleTask(item.id)}
            onDelete={() => removeTask(item.id)}
          />
        )}
      />

      <QuickAddModal
        visible={addOpen}
        defaultBucket={activeBucket}
        onClose={() => setAddOpen(false)}
        onCreate={(task) => addTask(task)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  headerTitle: typography.h1,
  headerSub: { ...typography.bodyMuted, marginTop: 4 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.purple,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  addBtnText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 30,
  },
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
    minHeight: 44,
  },
  tabActive: {
    borderColor: colors.purple,
    backgroundColor: '#1e1a3a',
  },
  tabIcon: { fontSize: 18 },
  tabLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabLabelActive: { color: colors.purple },
  badge: {
    backgroundColor: colors.purple,
    borderRadius: radius.full,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },

  rowOuter: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  swipeBg: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '100%',
    borderRadius: radius.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  swipeBgComplete: {
    backgroundColor: colors.fyi,
    alignItems: 'flex-start',
  },
  swipeBgDelete: {
    backgroundColor: colors.urgent,
    alignItems: 'flex-end',
  },
  swipeBgIcon: { fontSize: 26, color: '#fff' },

  taskCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    minHeight: 60,
  },
  taskCardDone: { opacity: 0.5 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkmark: { color: '#fff', fontSize: 16, fontWeight: '700' },
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
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 8,
  },
  empty: {
    paddingTop: spacing.xxl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { ...typography.h3, textAlign: 'center' },
  emptyText: { ...typography.bodyMuted, textAlign: 'center' },
  emptyAction: {
    marginTop: spacing.md,
    backgroundColor: colors.purple,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
  },
  emptyActionText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Modal
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  modalTitle: { ...typography.h2 },
  modalInput: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 17,
    minHeight: 56,
  },
  modalLabel: { ...typography.label },
  bucketPicker: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bucketOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    gap: 4,
  },
  bucketOptionActive: {
    borderColor: colors.purple,
    backgroundColor: '#1e1a3a',
  },
  bucketOptionIcon: { fontSize: 20 },
  bucketOptionLabel: { fontSize: 16, fontWeight: '600', color: colors.textMuted },
  bucketOptionLabelActive: { color: colors.purple },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priorityChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priorityChipText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.bgInput,
  },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: 16 },
  modalCreateBtn: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.purple,
  },
  modalCreateBtnDisabled: { opacity: 0.5 },
  modalCreateText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
