/**
 * In-process wake-up of the commit scheduler. The writer's entry points (`applyDocumentChange`,
 * `resumeDocumentChange`) announce a finished write here; a scheduler that serves the same Project
 * Home state root hears it and arms its settle timer. Nothing here knows the scheduler: listeners
 * are plain callbacks. The registry sits on the global symbol registry so that a second copy of
 * this module in the process (bundled twice) still reaches the same listeners.
 */
export interface DocumentChangeNotice {
  /** The Project Home state root the write happened in. */
  readonly stateRoot: string;
}

type Listener = (notice: DocumentChangeNotice) => void;

const LISTENERS = Symbol.for('nevo.specflow.engine.documentScheduler.listeners');
const listeners: Set<Listener> = ((globalThis as Record<symbol, unknown>)[LISTENERS] ??=
  new Set<Listener>()) as Set<Listener>;

/** Subscribes to finished writes; returns the unsubscribe function. */
export function onDocumentChangeApplied(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Announces a finished write. A listener that throws never disturbs the write. */
export function notifyDocumentChangeApplied(notice: DocumentChangeNotice): void {
  for (const listener of [...listeners]) {
    try {
      listener(notice);
    } catch {
      // A listener is an observer, not a participant of the write.
    }
  }
}
