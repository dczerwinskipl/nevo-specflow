export type DocumentKindId = 'markdown' | 'text';

/**
 * Which kind a file name belongs to. Kept apart from the descriptors (which know the edit session)
 * so the session itself can ask without importing them.
 */
export function kindIdOf(filename: string | undefined): DocumentKindId {
  return (filename ?? '').toLowerCase().endsWith('.txt') ? 'text' : 'markdown';
}
