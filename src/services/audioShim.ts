/**
 * audioShim.ts — graceful fallback when the ExpoAudio native module is absent.
 *
 * expo-audio requires a native module that must be compiled into the IPA.
 * If an older dev build is installed (or a fresh build hasn't landed yet),
 * requiring expo-audio throws at startup and kills the whole app.
 *
 * This shim detects availability once at module load, then exports:
 *   - isAudioAvailable  — false when we should skip all recording UI
 *   - useSafeAudioRecorder  — hook that always follows rules-of-hooks;
 *       delegates to the real hook when native is present, returns stubs otherwise
 *   - safeRequestPermissions / safeSetAudioMode — async wrappers that no-op when absent
 */

// ─── Detect native module once ───────────────────────────────────────────────

let _nativeAvailable = false;
try {
  require('expo-audio');
  _nativeAvailable = true;
} catch (e: any) {
  console.warn(
    '[audioShim] ExpoAudio require() failed — voice recording disabled. Error:',
    e?.message ?? e,
    e?.stack ? '\n' + String(e.stack).split('\n').slice(0, 6).join('\n') : ''
  );
}

export const isAudioAvailable = _nativeAvailable;

// ─── Stub recorder — matches the shape returned by useAudioRecorder ──────────

const STUB_RECORDER = {
  prepareToRecordAsync: async () => {},
  record: () => {},
  stop: async () => {},
  uri: null as string | null,
};

// ─── Hook — defined once per availability state so rules-of-hooks are upheld ─
//
// The same function reference is used for every render of every component that
// calls useSafeAudioRecorder. Because _nativeAvailable is a constant (set once
// at module load, never changes), React's "same hooks in same order" invariant
// is always satisfied.

let _useAudioRecorderImpl: () => typeof STUB_RECORDER;

if (_nativeAvailable) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useAudioRecorder, RecordingPresets } = require('expo-audio');
  _useAudioRecorderImpl = () => useAudioRecorder(RecordingPresets.HIGH_QUALITY);
} else {
  _useAudioRecorderImpl = () => STUB_RECORDER;
}

export const useSafeAudioRecorder = _useAudioRecorderImpl;

// ─── Async wrappers ──────────────────────────────────────────────────────────

export async function safeRequestPermissions(): Promise<{ granted: boolean }> {
  if (!_nativeAvailable) return { granted: false };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { requestRecordingPermissionsAsync } = require('expo-audio');
  return requestRecordingPermissionsAsync();
}

export async function safeSetAudioMode(
  options: Record<string, boolean>
): Promise<void> {
  if (!_nativeAvailable) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { setAudioModeAsync } = require('expo-audio');
  return setAudioModeAsync(options);
}
