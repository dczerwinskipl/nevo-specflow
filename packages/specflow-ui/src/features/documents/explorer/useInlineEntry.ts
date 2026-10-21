import { useRef, useState, type RefObject } from 'react';
import { useMessage } from '../../../i18n/message';
import { entryOriginKey, entryResultKey, resolveEntry, type InlineEntry } from './inlineEntry';
import type { EntryKind } from './documentTreePolicy';
import type { DocumentOperationsActions } from './useDocumentOperations';
import type { TreeFocus } from './useTreeFocus';

export type CommitSource = 'enter' | 'blur' | 'retry';

export interface InlineEntrySession {
  /** The entry being typed, if any. */
  entry: InlineEntry | undefined;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Begins a new entry (or a rename) after the pre-action check; opens `parent`. */
  start: (kind: EntryKind, parent: string, rename?: InlineEntry['rename']) => void;
  change: (name: string) => void;
  commit: (source: CommitSource) => Promise<void>;
  /** Escape: drops the entry unless an unknown outcome still needs checking. */
  cancel: () => void;
  /** Header-menu handoff: the entry started from a menu that is still closing. */
  beginFromMenu: (kind: EntryKind) => void;
  menuClosed: () => void;
  /** The input lost focus: commits it unless the header menu still holds focus. */
  blur: () => void;
  /** Gives the input focus again (row menu closing while an entry is open). */
  focusInput: () => boolean;
}

/**
 * The inline create/rename session: the entry being typed, when it commits (Enter, blur, retry),
 * and where focus goes afterwards. Whether the name is acceptable is `resolveEntry`; running the
 * operation is `useDocumentOperations`.
 */
export function useInlineEntry(options: {
  operations: DocumentOperationsActions;
  focus: TreeFocus;
  /** A folder that gets a new entry must be open. */
  onOpenFolder: (folder: string) => void;
}): InlineEntrySession {
  const { operations, focus, onOpenFolder } = options;
  const text = useMessage();
  const [entry, setEntry] = useState<InlineEntry>();
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter and blur can fire before the next render, so handlers read the entry from this
  // synchronous mirror (set together with the state; never during render).
  const latest = useRef<InlineEntry | undefined>(undefined);
  const lastSubmitted = useRef('');
  // True from a header-menu `create` until that menu has closed (then `menuClosed` takes focus).
  const awaitingMenuClose = useRef(false);

  const put = (next: InlineEntry | undefined) => {
    latest.current = next;
    setEntry(next);
  };

  const start: InlineEntrySession['start'] = (kind, parent, rename) =>
    void operations.guard((snapshot) => {
      const document = rename?.id
        ? snapshot.documents.find((doc) => doc.id === rename.id)
        : undefined;
      if (rename && kind === 'document' && !document) throw new Error('Missing document');
      onOpenFolder(parent);
      put({
        key: crypto.randomUUID(),
        kind,
        parent,
        name: rename?.path.split('/').at(-1) ?? '',
        rename: rename ? { ...rename, path: document?.path ?? rename.path } : undefined,
        expectedRevision: kind === 'document' ? document?.revision : snapshot.revision,
      });
    });

  const commit: InlineEntrySession['commit'] = async (source) => {
    const current = latest.current;
    if (!current || operations.isBusy() || (operations.isUnknown() && source !== 'retry')) return;
    const signature = current.key + ':' + current.name;
    if (source === 'blur' && lastSubmitted.current === signature) return;
    lastSubmitted.current = signature;
    const decision = resolveEntry(current);
    if (decision.type === 'cancel') {
      focus.request(entryOriginKey(current));
      put(undefined);
      return;
    }
    if (decision.type === 'invalid') {
      lastSubmitted.current = '';
      const error = text(decision.message);
      setEntry((now) => (now?.key === current.key ? { ...now, error } : now));
      latest.current = { ...current, error };
      return;
    }
    await operations.submitEntry(current, decision.finalName, (outcome) => {
      if (outcome.ok) {
        focus.request(entryResultKey(current, decision.finalName));
        put(undefined);
      } else {
        setEntry((now) => (now?.key === current.key ? { ...now, error: outcome.message } : now));
      }
    });
  };

  return {
    entry,
    inputRef,
    start,
    change: (name) => {
      if (!entry) return;
      put({ ...entry, name, error: undefined });
    },
    commit,
    cancel: () => {
      const current = latest.current;
      if (!current || operations.isUnknown()) return;
      focus.request(entryOriginKey(current));
      put(undefined);
    },
    beginFromMenu: (kind) => {
      awaitingMenuClose.current = true;
      start(kind, '');
    },
    menuClosed: () => {
      awaitingMenuClose.current = false;
      inputRef.current?.focus();
    },
    blur: () => {
      // The header menu that started this entry still holds focus while it closes.
      if (awaitingMenuClose.current) return;
      void commit('blur');
    },
    focusInput: () => {
      if (!latest.current) return false;
      queueMicrotask(() => inputRef.current?.focus());
      return true;
    },
  };
}
