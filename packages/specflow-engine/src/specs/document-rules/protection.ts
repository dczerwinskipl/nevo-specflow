import { foldPathKey } from './document-paths';

/**
 * The framework invariant: `overview` is the only protected document. Its id, path and type are
 * fixed; delete, rename and move are refused with the `protected` reason (see
 * `docs/architecture/runtime/specification-documents.md`). This module is the single place that decides it; the parser and, later, the
 * actions import {@link isProtectedDocument}.
 */
export const OVERVIEW_DOCUMENT_ID = 'overview';
export const OVERVIEW_DOCUMENT_PATH = 'overview.md';
export const OVERVIEW_DOCUMENT_TYPE = 'overview';

export interface ProtectableDocument {
  readonly id: string;
  readonly path?: string;
}

/** True when the registry entry is the protected overview (by id, or by its fixed path ignoring case). */
export function isProtectedDocument(document: ProtectableDocument): boolean {
  return (
    document.id === OVERVIEW_DOCUMENT_ID ||
    (document.path !== undefined &&
      foldPathKey(document.path) === foldPathKey(OVERVIEW_DOCUMENT_PATH))
  );
}

/** True when deleting the folder (and everything below it) would delete the protected document. */
export function folderContainsProtectedDocument(folderPath: string): boolean {
  const folder = folderPath === '' ? '' : foldPathKey(folderPath) + '/';

  return foldPathKey(OVERVIEW_DOCUMENT_PATH).startsWith(folder);
}
