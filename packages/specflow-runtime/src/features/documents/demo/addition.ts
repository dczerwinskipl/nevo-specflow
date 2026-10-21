import type { DemoAddedDocument } from '@nevo/specflow-contracts/demo';

export class InvalidDocumentPath extends Error {}
export class DocumentPathConflict extends Error {}
const key = (path: string) => path.toLowerCase();
export function validatePath(path: string, file: boolean) {
  if (
    !path ||
    path.length > 500 ||
    path !== path.trim() ||
    /[\\:*?"<>|]/.test(path) ||
    [...path].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    path
      .split('/')
      .some(
        (part) =>
          !part ||
          part.startsWith('.') ||
          part.endsWith('.') ||
          part.endsWith(' ') ||
          /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      ) ||
    (file && !/\.(md|txt)$/i.test(path))
  )
    throw new InvalidDocumentPath();
}
/** Validates the entire batch before IDs or collection state are changed. */
export function planDocumentAddition(
  existingFiles: string[],
  existingFolders: string[],
  documents: DemoAddedDocument[],
  folders: string[],
) {
  if (documents.length > 10 || folders.length > 100 || (!documents.length && !folders.length))
    throw new InvalidDocumentPath();
  const files = new Set(existingFiles.map(key));
  const directoryPaths = new Map(existingFolders.map((path) => [key(path), path]));
  const explicitFolders = new Set(existingFolders.map(key));
  const ensureParents = (path: string) => {
    const parts = path.split('/');
    let canonicalParent = '';
    for (let count = 1; count < parts.length; count++) {
      const parent = [canonicalParent, parts[count - 1]!].filter(Boolean).join('/');
      if (files.has(key(parent))) throw new DocumentPathConflict();
      if (!directoryPaths.has(key(parent))) directoryPaths.set(key(parent), parent);
      canonicalParent = directoryPaths.get(key(parent))!;
    }
    return [canonicalParent, parts.at(-1)!].filter(Boolean).join('/');
  };
  for (const path of existingFiles) ensureParents(path);
  for (const path of folders) {
    validatePath(path, false);
    if (files.has(key(path)) || explicitFolders.has(key(path))) throw new DocumentPathConflict();
    const canonicalPath = ensureParents(path);
    explicitFolders.add(key(canonicalPath));
    directoryPaths.set(key(canonicalPath), canonicalPath);
  }
  const normalizedDocuments: DemoAddedDocument[] = [];
  for (const document of documents) {
    validatePath(document.path, true);
    if (
      document.content.length > 200000 ||
      (document.title !== undefined && (!document.title.trim() || document.title.length > 240))
    )
      throw new InvalidDocumentPath();
    if (files.has(key(document.path)) || directoryPaths.has(key(document.path)))
      throw new DocumentPathConflict();
    const canonicalPath = ensureParents(document.path);
    normalizedDocuments.push({ ...document, path: canonicalPath });
    files.add(key(canonicalPath));
  }
  return { documents: normalizedDocuments, folders: [...directoryPaths.values()] };
}
