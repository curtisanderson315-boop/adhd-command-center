/**
 * Background email polling — ADHD Command Center
 *
 * Polls Gmail on the iOS background-fetch schedule. Triages new emails with
 * Claude Haiku and writes the resulting queue back to AsyncStorage so the app
 * can render it on next open. Fires a local notification when urgent items
 * are found and the user has notifications enabled.
 *
 * The TaskManager.defineTask call MUST live at module top level, before any
 * React rendering, so the OS can re-execute the task body on a cold launch.
 */

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppSettings, TriagedEmail } from '../types';
import { fetchUnreadEmails } from './gmail';
import { triageEmail } from './ai';

export const ADHD_EMAIL_POLL = 'ADHD_EMAIL_POLL';
export const NOTIFICATION_TAP_ROUTE = 'ADHD_NOTIFICATION_ROUTE';

const SETTINGS_KEY = '@adhd:settings';
const TRIAGE_QUEUE_KEY = '@adhd:triageQueue';

// ─── Define the task at module scope ────────────────────────────────────

TaskManager.defineTask(ADHD_EMAIL_POLL, async () => {
  try {
    const result = await runEmailPoll();
    return result
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (e) {
    console.warn('[BackgroundPoll] failed:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ─── Poll body ──────────────────────────────────────────────────────────

async function runEmailPoll(): Promise<boolean> {
  const rawSettings = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!rawSettings) return false;
  const settings: AppSettings = JSON.parse(rawSettings);

  if (!settings.anthropicKey || !settings.googleAccessToken) return false;
  if (settings.triageIntervalMinutes === 0) return false; // Manual mode

  const rawEmails = await fetchUnreadEmails(15);
  if (rawEmails.length === 0) return false;

  const triaged: TriagedEmail[] = await Promise.all(
    rawEmails.map((e) => triageEmail(e, settings.anthropicKey))
  );

  const order = { urgent: 0, action_needed: 1, fyi: 2, noise: 3 };
  triaged.sort((a, b) => order[a.priority] - order[b.priority]);

  await AsyncStorage.setItem(TRIAGE_QUEUE_KEY, JSON.stringify(triaged));

  const urgentCount = triaged.filter(
    (e) => e.priority === 'urgent' || e.priority === 'action_needed'
  ).length;

  if (urgentCount > 0 && settings.notificationsEnabled) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: urgentCount === 1 ? '📥 1 email needs your attention' : `📥 ${urgentCount} emails need your attention`,
        body: triaged[0]?.subject ?? 'Open Triage to review',
        data: { type: NOTIFICATION_TAP_ROUTE, route: 'Triage' },
      },
      trigger: null, // immediately
    });
  }

  return true;
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Register the background fetch task. Safe to call repeatedly — re-registering
 * with a new interval replaces the previous schedule. Pass 0 to unregister.
 */
export async function registerBackgroundPolling(intervalMinutes: number): Promise<void> {
  if (intervalMinutes <= 0) {
    await unregisterBackgroundPolling();
    return;
  }
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(ADHD_EMAIL_POLL);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(ADHD_EMAIL_POLL);
    }
    await BackgroundFetch.registerTaskAsync(ADHD_EMAIL_POLL, {
      minimumInterval: Math.max(60, intervalMinutes * 60), // iOS may not honor sub-15-min intervals; floor at 60s
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch (e) {
    console.warn('[BackgroundPoll] register failed:', e);
  }
}

export async function unregisterBackgroundPolling(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(ADHD_EMAIL_POLL);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(ADHD_EMAIL_POLL);
    }
  } catch (e) {
    console.warn('[BackgroundPoll] unregister failed:', e);
  }
}

/**
 * Read the most-recent background-triaged queue, if any. Used by the store on
 * hydrate so the user sees emails the background poll already processed.
 */
export async function getStoredTriageQueue(): Promise<TriagedEmail[]> {
  try {
    const raw = await AsyncStorage.getItem(TRIAGE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearStoredTriageQueue(): Promise<void> {
  await AsyncStorage.removeItem(TRIAGE_QUEUE_KEY);
}
