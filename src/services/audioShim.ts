/**
 * audioShim.ts — graceful fallback when the ExpoAV native module is absent.
 *
 * Wraps expo-av's class-based Audio.Recording API in a hook-shaped interface
 * that matches what CaptureBar expects (prepareToRecordAsync, record, stop, uri).
 *
 * If the native module isn't linked into the IPA, we degrade to stubs so the
 * app still launches; CaptureBar checks isAudioAvailable and falls through to
 * text input.
 */

import { useRef } from 'react';

// ─── Detect native module once ───────────────────────────────────────────────

let _nativeAvailable = false;
try {
  require('expo-av');
  _nativeAvailable = true;
} catch (e: any) {
  const g: any = globalThis as any;
  const keys = Object.keys(g.expo?.modules ?? {});
  let ipaInfo = '';
  try {
    const App = require('expo-application');
    ipaInfo = ` | nativeApplicationVersion=${App.nativeApplicationVersion} nativeBuildVersion=${App.nativeBuildVersion} bundleId=${App.applicationId}`;
  } catch {}
  console.warn(
    '[audioShim] expo-av require() failed — voice recording disabled. Error:',
    e?.message ?? e,
    `\n  globalThis.expo.modules keys (${keys.length}): ${keys.join(', ') || '(empty)'}`,
    ipaInfo
  );
}

export const isAudioAvailable = _nativeAvailable;

// ─── Recorder handle shape (what CaptureBar consumes) ────────────────────────

interface RecorderHandle {
  prepareToRecordAsync: () => Promise<void>;
  record: () => void;
  stop: () => Promise<void>;
  readonly uri: string | null;
}

const STUB_RECORDER: RecorderHandle = {
  prepareToRecordAsync: async () => {},
  record: () => {},
  stop: async () => {},
  uri: null,
};

// ─── Hook — same hook order across renders (constant native-availability) ────

let _useAudioRecorderImpl: () => RecorderHandle;

if (_nativeAvailable) {
  _useAudioRecorderImpl = () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Audio } = require('expo-av');
    const stateRef = useRef<{ instance: any; uri: string | null }>({
      instance: null,
      uri: null,
    });

    return {
      prepareToRecordAsync: async () => {
        const r = new Audio.Recording();
        await r.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        stateRef.current.instance = r;
        stateRef.current.uri = null;
      },
      record: () => {
        stateRef.current.instance?.startAsync();
      },
      stop: async () => {
        const r = stateRef.current.instance;
        if (!r) return;
        try {
          await r.stopAndUnloadAsync();
          stateRef.current.uri = r.getURI();
        } finally {
          stateRef.current.instance = null;
        }
      },
      get uri() {
        return stateRef.current.uri;
      },
    };
  };
} else {
  _useAudioRecorderImpl = () => STUB_RECORDER;
}

export const useSafeAudioRecorder = _useAudioRecorderImpl;

// ─── Async wrappers ──────────────────────────────────────────────────────────

export async function safeRequestPermissions(): Promise<{ granted: boolean }> {
  if (!_nativeAvailable) return { granted: false };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Audio } = require('expo-av');
  const result = await Audio.requestPermissionsAsync();
  return { granted: !!result?.granted };
}

/**
 * Accepts the expo-audio-style option names (playsInSilentMode, allowsRecording)
 * for backwards compatibility with CaptureBar's call sites and maps to expo-av's
 * iOS-suffixed names.
 */
export async function safeSetAudioMode(
  options: { playsInSilentMode?: boolean; allowsRecording?: boolean }
): Promise<void> {
  if (!_nativeAvailable) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Audio } = require('expo-av');
  const mapped: Record<string, boolean> = {};
  if (options.playsInSilentMode !== undefined) mapped.playsInSilentModeIOS = options.playsInSilentMode;
  if (options.allowsRecording !== undefined) mapped.allowsRecordingIOS = options.allowsRecording;
  return Audio.setAudioModeAsync(mapped);
}
