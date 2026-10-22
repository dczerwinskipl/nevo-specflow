import type { Message } from '../../../i18n/message';
import {
  entryNameError,
  finalEntryName,
  joinDocumentPath,
  type EntryKind,
} from './documentTreePolicy';

/** The name being typed in the tree: a new file or folder, or a rename of an existing entry. */
export interface InlineEntry {
  key: string;
  kind: EntryKind;
  /** Folder the entry is created in (the folder that contains it for a rename). */
  parent: string;
  name: string;
  rename?: { id?: string; path: string };
  error?: string;
  expectedRevision?: string;
}

/** What committing the typed name means. */
export type EntryDecision =
  /** Nothing to do: empty name or an unchanged rename (no operation, no revision bump). */
  | { type: 'cancel' }
  | { type: 'invalid'; message: Message }
  | { type: 'submit'; finalName: string };

export function resolveEntry(entry: InlineEntry): EntryDecision {
  if (!entry.name.trim()) return { type: 'cancel' };
  const invalid = entryNameError(entry.name, entry.kind);
  if (invalid) return { type: 'invalid', message: invalid };
  const currentName = entry.rename?.path.split('/').at(-1);
  const finalName = finalEntryName(entry.name, entry.kind, currentName);
  if (entry.rename && finalName === currentName) return { type: 'cancel' };
  return { type: 'submit', finalName };
}

/** Tree-node key focus returns to when the entry is cancelled (the row it started from). */
export function entryOriginKey(entry: InlineEntry): string {
  return entry.rename
    ? entry.kind === 'document'
      ? 'doc:' + entry.rename.id
      : 'folder:' + entry.rename.path
    : 'folder:' + entry.parent;
}

/** Tree-node key focus moves to once the entry was applied. */
export function entryResultKey(entry: InlineEntry, finalName: string): string {
  return entry.kind === 'folder'
    ? 'folder:' + joinDocumentPath(entry.parent, finalName)
    : entry.rename?.id
      ? 'doc:' + entry.rename.id
      : 'folder:' + entry.parent;
}
