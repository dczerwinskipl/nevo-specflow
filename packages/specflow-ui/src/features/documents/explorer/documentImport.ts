import type { DocumentTree } from '@nevo/specflow-contracts/documents';
import { message, type Message } from '../../../i18n/message';
import { joinDocumentPath, uploadNameReason, type PlannedDocument } from './documentTreePolicy';

/** Import limits mirrored from the Runtime; the skip reasons quote them. */
export const importLimits = {
  files: 10,
  fileBytes: 2 * 1024 * 1024,
  contentCharacters: 200_000,
  pathCharacters: 500,
} as const;

export interface SkippedFile {
  name: string;
  reason: Message;
}

export interface ImportPlan {
  /** Files that will be sent, in selection order. */
  accepted: PlannedDocument[];
  /** Files left out, each with the reason shown to the reader. */
  skipped: SkippedFile[];
}

/**
 * Validates a file selection against the import limits and the current tree without sending
 * anything. Rejected files never block the accepted ones; each gets exactly one reason (the first
 * rule it breaks, in the order a reader would fix them).
 */
export async function planImport(
  files: readonly File[],
  folder: string,
  tree: Pick<DocumentTree, 'documents' | 'folders' | 'capabilities'>,
): Promise<ImportPlan> {
  const accepted: PlannedDocument[] = [];
  const skipped: SkippedFile[] = [];
  const taken = (path: string) => {
    const key = path.toLowerCase();

    return (
      tree.documents.some((doc) => doc.path.toLowerCase() === key) ||
      tree.folders.some((existing) => existing.path.toLowerCase() === key) ||
      accepted.some((doc) => doc.path.toLowerCase() === key)
    );
  };

  /** Size, format, path and collision rules, once the name itself is acceptable. */
  const contentReason = (file: File, path: string): Message | undefined => {
    const extension = file.name.split('.').at(-1)?.toLowerCase();
    if (file.size > importLimits.fileBytes) {
      return message('documents.tree.skip.size');
    }

    if (!tree.capabilities.formats.includes(extension ?? '')) {
      return message('documents.tree.skip.format');
    }

    if (path.length > importLimits.pathCharacters) {
      return message('documents.tree.skip.path');
    }

    return taken(path) ? message('documents.tree.skip.exists') : undefined;
  };

  for (const [index, file] of files.entries()) {
    const path = joinDocumentPath(folder, file.name);
    const reason: Message | undefined =
      index >= importLimits.files
        ? message('documents.tree.skip.limit')
        : (uploadNameReason(file.name) ?? contentReason(file, path));
    if (reason) {
      skipped.push({ name: file.name, reason });
      continue;
    }

    try {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (content.length > importLimits.contentCharacters) {
        skipped.push({ name: file.name, reason: message('documents.tree.skip.content') });
        continue;
      }

      accepted.push({ path, content });
    } catch {
      skipped.push({ name: file.name, reason: message('documents.tree.skip.utf8') });
    }
  }

  return { accepted, skipped };
}
