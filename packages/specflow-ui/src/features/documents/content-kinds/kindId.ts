import type { ContentKind } from '@nevo/specflow-contracts/documents';

export type TextKindId = 'markdown' | 'text';

/**
 * Which text kind a file name belongs to. Kept apart from the descriptors (which know the edit
 * session) so the session itself can ask without importing them.
 */
export function kindIdOf(filename: string | undefined): TextKindId {
  return /\.(md|markdown)$/i.test(filename ?? '') ? 'markdown' : 'text';
}

/**
 * The document has text the editor can hold as a draft: a text document whose content was
 * delivered. Images, binary files and text above the read limit are viewed only (no draft).
 */
export function hasTextDraft(document: { kind?: ContentKind; content?: string }): boolean {
  return (
    (document.kind === undefined || document.kind === 'text') && document.content !== undefined
  );
}
