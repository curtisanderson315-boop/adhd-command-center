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

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppSettings, SmartSuggestion, TriagedEmail } from '../types';
import { fetchUnreadEmails } from './gmail';
import { triageEmail } from './ai';
import { fetchUpcomingEvents } from './calendar';
import { dedupKey, scanForSuggestions } from './smartScan';
import { runActivationCoach } from './activationCoach';
import { syncSourcesToActionCards } from './actionCards';

export const ADHD_EMAIL_POLL = 'ADHD_EMAIL_POLL';
export const NOTIFICATION_TAP_ROUTE = 'ADHD_NOTIFICATION_ROUTE';

const SETTINGS_KEY = '@adhd:settings';
const TRIAGE_QUEUE_KEY = '@adhd:triageQueue';
const SUGGESTIONS_KEY = '@adhd:suggestions';
const LAST_SCAN_AT_KEY = '@adhd:lastScanAt';

// ─── Lazy-load native background modules so a missing native binary doesn't
//     crash the app at startup. Both expo-background-fetch and expo-task-manager
//     require the native module to be present in the IPA — if it's not linked
//     (e.g. older dev build), we degrade gracefully instead of throwing. ─────

let BackgroundFetch: typeof import('expo-background-fetch') | null = null;
let TaskManager: typeof import('expo-task-manager') | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  BackgroundFetch = require('expo-background-fetch');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  TaskManager = require('expo-task-manager');
} catch (e: any) {
  console.warn(
    '[BackgroundPoll] require() failed — background polling disabled. Error:',
    e?.message ?? e,
    e?.stack ? '\n' + String(e.stack).split('\n').slice(0, 6).join('\n') : ''
  );
}

// ─── Define the task at module scope (only when native module is present) ──

if (TaskManager && BackgroundFetch) {
  TaskManager.defineTask(ADHD_EMAIL_POLL, async () => {
    try {
      const hadNew = await runEmailPoll();
      return hadNew
        ? BackgroundFetch!.BackgroundFetchResult.NewData
        : BackgroundFetch!.BackgroundFetchResult.NoData;
    } catch (e) {
      console.warn('[BackgroundPoll] failed:', e);
      return BackgroundFetch!.BackgroundFetchResult.Failed;
    }
  });
}

// ─── Poll body ──────────────────────────────────────────────────────────

async function runEmailPoll(): Promise<boolean> {
  const rawSettings = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!rawSettings) return false;
  const settings: AppSettings = JSON.parse(rawSettings);

  if (!settings.anthropicKey || !settings.googleAccessToken) return false;
  if (settings.triageIntervalMinutes === 0) return false; // Manual mode

  const rawEmails = await fetchUnreadEmails(15);

  // ── Step 1: Triage new emails (existing path) ────────────────────────────
  let triaged: TriagedEmail[] = [];
  if (rawEmails.length > 0) {
    triaged = await Promise.all(
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
          title:
            urgentCount === 1
              ? '📥 1 email needs your attention'
              : `📥 ${urgentCount} emails need your attention`,
          body: triaged[0]?.subject ?? 'Open Triage to review',
          data: { type: NOTIFICATION_TAP_ROUTE, route: 'Triage' },
        },
        trigger: null,
      });
    }
  }

  // ── Step 2: Smart scan (PIE) — non-fatal if it fails ─────────────────────
  await runSmartScan(settings, rawEmails);

  // ── Step 3: Sync source-projected cards into actionCards storage so the
  //          activation coach (and any other consumer) sees a complete list.
  try {
    await syncSourcesToActionCards();
  } catch (e) {
    console.warn('[BackgroundPoll] syncSourcesToActionCards failed:', e);
  }

  // ── Step 4: Activation coach — fill firstStep on stalled cards. Bounded
  //          to MAX_PER_RUN = 5, so token cost stays predictable.
  try {
    const filled = await runActivationCoach(settings.anthropicKey);
    if (filled > 0) console.log(`[BackgroundPoll] activation coach filled ${filled} firstSteps`);
  } catch (e) {
    console.warn('[BackgroundPoll] activation coach failed:', e);
  }

  return true;
}

/**
 * Run a smart scan + merge results into the persisted suggestions store.
 * Wrapped so a failure here cannot break the email-triage path above.
 */
async function runSmartScan(settings: AppSettings, rawEmails: any[]): Promise<void> {
  try {
    const events = await fetchUpcomingEvents(30);
    if (rawEmails.length === 0 && events.length === 0) return;

    const fresh = await scanForSuggestions(
      rawEmails,
      events,
      settings.userEmail ?? '',
      settings.anthropicKey
    );
    if (fresh.length === 0) {
      await AsyncStorage.setItem(LAST_SCAN_AT_KEY, new Date().toISOString());
      return;
    }

    // Merge with existing — dedupe by (type + normalized title)
    const rawExisting = await AsyncStorage.getItem(SUGGESTIONS_KEY);
    const existing: SmartSuggestion[] = rawExisting ? JSON.parse(rawExisting) : [];
    const seen = new Set<string>();
    const merged: SmartSuggestion[] = [];

    // Existing first so they keep their id/status
    for (const s of existing) {
      const key = dedupKey(s);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(s);
    }

    const newHigh: SmartSuggestion[] = [];
    for (const s of fresh) {
      const key = dedupKey(s);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(s);
      if (s.urgency === 'high') newHigh.push(s);
    }

    await AsyncStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(merged));
    await AsyncStorage.setItem(LAST_SCAN_AT_KEY, new Date().toISOString());

    if (newHigh.length > 0 && settings.notificationsEnabled) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '✨ Something needs your attention',
          body: newHigh[0]?.title ?? 'Open the Smart tab to review',
          data: { type: NOTIFICATION_TAP_ROUTE, route: 'Suggestions' },
        },
        trigger: null,
      });
    }
  } catch (e) {
    console.warn('[BackgroundPoll] smartScan failed:', e);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Register the background task. Safe to call repeatedly — re-registering
 * with a new interval replaces the previous schedule. Pass 0 to unregister.
 *
 * Note: `minimumInterval` is in SECONDS in expo-background-fetch. iOS enforces
 * a ~15-minute floor regardless of what we pass.
 */
export async function registerBackgroundPolling(intervalMinutes: number): Promise<void> {
  if (!TaskManager || !BackgroundFetch) return; // native module not available
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
      minimumInterval: Math.max(15, intervalMinutes) * 60, // seconds
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch (e) {
    console.warn('[BackgroundPoll] register failed:', e);
  }
}

export async function unregisterBackgroundPolling(): Promise<void> {
  if (!TaskManager || !BackgroundFetch) return; // native module not available
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
