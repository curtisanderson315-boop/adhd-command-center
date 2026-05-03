/**
 * Siri Shortcuts bridge
 *
 * NOTE: This requires the native setup described in siri/README.md
 * It will no-op gracefully on Android or if the native module isn't linked.
 */

import { Platform, NativeModules, NativeEventEmitter } from 'react-native';

// Lazily import — won't crash if module isn't linked yet
let SiriShortcuts: any = null;
try {
  SiriShortcuts = require('react-native-siri-shortcut').default;
} catch (_) {
  console.log('[Siri] react-native-siri-shortcut not linked yet — see siri/README.md');
}

export interface SiriShortcut {
  activityType: string;
  title: string;
  userInfo?: Record<string, string>;
  suggestedInvocationPhrase: string;
}

const SHORTCUTS: SiriShortcut[] = [
  {
    activityType: 'com.curtisanderson.adhdcommandcenter.logthought',
    title: 'Log a Thought',
    suggestedInvocationPhrase: 'Log a thought',
    userInfo: { action: 'log_thought' },
  },
  {
    activityType: 'com.curtisanderson.adhdcommandcenter.addtask',
    title: 'Add a Task',
    suggestedInvocationPhrase: 'Add a task',
    userInfo: { action: 'add_task' },
  },
  {
    activityType: 'com.curtisanderson.adhdcommandcenter.triage',
    title: 'Open Email Triage',
    suggestedInvocationPhrase: 'Show my emails',
    userInfo: { action: 'triage' },
  },
];

/**
 * Register all shortcuts with iOS. Call this once on app launch.
 */
export async function registerShortcuts(): Promise<void> {
  if (!SiriShortcuts || Platform.OS !== 'ios') return;
  try {
    for (const shortcut of SHORTCUTS) {
      await SiriShortcuts.donateShortcut(shortcut);
    }
    console.log('[Siri] Shortcuts registered');
  } catch (e) {
    console.warn('[Siri] Failed to register shortcuts:', e);
  }
}

/**
 * Listen for Siri shortcut activations.
 * Returns the action string from userInfo, or null.
 */
export function onSiriShortcut(
  callback: (action: string, params?: Record<string, string>) => void
): () => void {
  if (!SiriShortcuts || Platform.OS !== 'ios') return () => {};

  const emitter = new NativeEventEmitter(NativeModules.RNSiriShortcuts);
  const sub = emitter.addListener('SiriShortcutListener', (event) => {
    const action = event?.userInfo?.action;
    if (action) callback(action, event.userInfo);
  });

  return () => sub.remove();
}
