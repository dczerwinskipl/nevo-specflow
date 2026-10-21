/**
 * Synchronous gate of the Documents tree operations: at most one operation is in flight, no new one
 * starts while the pre-action check runs, and an operation whose outcome is unknown blocks every
 * other action until it is checked again. Event handlers read it before React re-renders, so it
 * is a plain object (rendered state is mirrored by the owner); it holds no UI.
 */
export interface OperationLock {
  readonly busy: boolean;
  readonly checking: boolean;
  readonly unknown: boolean;
  /** A new action may start: nothing in flight, not checking, no unknown outcome. */
  canBegin: () => boolean;
  /** The tree accepts a selection: nothing in flight and no unknown outcome. */
  canSelect: () => boolean;
  setBusy: (busy: boolean) => void;
  setChecking: (checking: boolean) => void;
  setUnknown: (unknown: boolean) => void;
}

export function createOperationLock(): OperationLock {
  const flags = { busy: false, checking: false, unknown: false };
  return {
    get busy() {
      return flags.busy;
    },
    get checking() {
      return flags.checking;
    },
    get unknown() {
      return flags.unknown;
    },
    canBegin: () => !flags.busy && !flags.checking && !flags.unknown,
    canSelect: () => !flags.busy && !flags.unknown,
    setBusy: (busy) => {
      flags.busy = busy;
    },
    setChecking: (checking) => {
      flags.checking = checking;
    },
    setUnknown: (unknown) => {
      flags.unknown = unknown;
    },
  };
}
