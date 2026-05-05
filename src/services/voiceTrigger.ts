/**
 * Tiny pub/sub for "start recording NOW" requests from outside the
 * FloatingMic component. Used by Drive Mode (Siri shortcut) and could be
 * reused by any future trigger (e.g. a hardware button).
 *
 * Kept out of Zustand on purpose: this is a one-shot transient signal, not
 * persistent state. A counter is used instead of a boolean so two rapid-
 * succession triggers both fire (the value changes both times).
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** App.tsx (or the Siri handler) calls this to ask FloatingMic to record. */
export function requestVoiceCapture(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch (e) {
      console.warn('[voiceTrigger] listener threw:', e);
    }
  });
}

/** FloatingMic subscribes; returns an unsubscribe function. */
export function onVoiceCaptureRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
