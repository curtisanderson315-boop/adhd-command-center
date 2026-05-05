/**
 * Tiny pub/sub for the global Undo Banner. Same shape as voiceTrigger.ts —
 * keeps the App-level UndoBanner decoupled from the call sites that
 * trigger it (Bundle list dismiss, future Now Feed swipe, etc.).
 *
 * Each request includes a callback the banner invokes when the user taps
 * Undo. That callback runs the actual restore (e.g. store.restoreCard).
 * Kept out of Zustand on purpose: this is a transient UI signal, not
 * persistent state.
 */

export interface UndoBannerRequest {
  /** What was just dismissed. Shown in the banner: "Dismissed: <message>". */
  message: string;
  /** Invoked when the user taps Undo. May be sync or async. */
  onUndo: () => void | Promise<void>;
}

type Listener = (req: UndoBannerRequest) => void;
const listeners = new Set<Listener>();

/** Bundle list (or any future call site) calls this to ask UndoBanner to show. */
export function requestUndoBanner(req: UndoBannerRequest): void {
  listeners.forEach((l) => {
    try {
      l(req);
    } catch (e) {
      console.warn('[undoBanner] listener threw:', e);
    }
  });
}

/** UndoBanner subscribes; returns an unsubscribe function. */
export function onUndoBannerRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
