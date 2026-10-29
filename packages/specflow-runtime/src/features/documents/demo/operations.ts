import type {
  CommitInfo,
  CreateDocumentsInput,
  DocumentOperationInput,
  DocumentOperationResult,
  SaveInput,
  SaveResult,
} from '@nevo/specflow-contracts/documents';
import type { DemoFolderInput } from '@nevo/specflow-contracts/demo';
import { DocumentError, deriveDocumentTitle } from '@nevo/specflow-engine';
import type { DemoSpecification } from '../../demo-catalogue';
import type { DemoState } from '../../../demo/state';
import { allFolders, decodeText, sha256, type DemoSpecDocuments } from './model';
import { demoTree, documentIdOf } from './projection';
import { scaffoldDocuments, type DemoScaffoldInput } from './scaffold';
import { seedDocuments } from './seed';
import { assertWritable, planCreate, planOperation, planSave, type PlannedWrite } from './writes';

type Find = (specId: string) => Promise<DemoSpecification | undefined>;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Documents-owned demo operations over the shared demo state. Every Specification has one in-memory
 * document directory: a created one lives in `state.specifications`, a seeded (catalogue) one is
 * built from its seed on first use and kept here. Reads project it with the Engine's rules; writes
 * emulate the D4 operations (idempotent by `operationId`, refused with the real error codes).
 */
export function createDemoDocuments(
  state: DemoState,
  options: {
    showcase?: boolean;
    /** Simulated commit latency of every write, in ms (default 0). Other writes meanwhile: `SPEC_BUSY`. */
    commitLatencyMs?: number;
    /** Told after a specification's document paths changed; wired by the demo composition root. */
    onPathsChanged?: (specId: string, paths: readonly string[]) => void;
  } = {},
) {
  const seeded = new Map<string, DemoSpecDocuments>();
  const latency = options.commitLatencyMs ?? 0;

  /** The directory of a Specification whose record is known (created, or seeded on first use). */
  const directoryOf = (specId: string, record?: DemoSpecification) => {
    const created = state.specifications.get(specId)?.documents;
    if (created) {
      return created;
    }

    let documents = seeded.get(specId);
    if (!documents && record) {
      documents = seedDocuments(record, state.archetypes, { showcase: options.showcase });
      seeded.set(specId, documents);
    }

    return documents;
  };

  const directory = async (specId: string, find: Find) =>
    directoryOf(specId, state.specifications.has(specId) ? undefined : await find(specId));

  const pathsOf = (documents: DemoSpecDocuments) => [...documents.files.keys()].sort();

  async function write<R>(
    subject: string,
    specId: string,
    find: Find,
    operation: { name: string; operationId: string; input: unknown },
    plan: (documents: DemoSpecDocuments) => PlannedWrite,
    answer: (documents: DemoSpecDocuments, planned: PlannedWrite) => R,
  ): Promise<R> {
    const documents = await directory(specId, find);
    if (!documents) {
      throw new DocumentError('DOCUMENT_NOT_FOUND', 'Unknown Specification.');
    }

    const entry = state.request(
      subject,
      operation.name + ':' + specId,
      operation.operationId,
      operation.input,
      () =>
        new DocumentError(
          'DOCUMENT_OPERATION_CONFLICT',
          'The operation id was used with another body.',
        ),
    );
    if (entry.result) {
      return entry.result as R;
    }

    assertWritable(documents);
    const planned = plan(documents);
    if (state.failing('save')) {
      throw new DocumentError('COMMIT_BLOCKED', 'The checkout cannot take a commit now.', {
        reason: 'commit-blocked',
        blockedBy: 'git-busy',
      });
    }

    if (latency > 0) {
      documents.busy = true;
      try {
        await delay(latency);
      } finally {
        documents.busy = false;
      }
    }

    const pathsBefore = pathsOf(documents).join('\n');
    documents.registry = planned.registry;
    documents.files = planned.files;
    documents.folders = planned.folders;
    const paths = pathsOf(documents);
    if (paths.join('\n') !== pathsBefore) {
      options.onPathsChanged?.(specId, paths);
    }

    const result = answer(documents, planned);
    entry.result = result;

    return result;
  }

  // The demo commits at once (like auto-commit on): a committed state with a stable fake sha.
  const commitOf = (operationId: string, revision: string): CommitInfo => ({
    state: 'committed',
    sha: sha256(operationId + ':' + revision).slice(0, 40),
  });
  const operationResult =
    (operationId: string) =>
    (documents: DemoSpecDocuments, planned: PlannedWrite): DocumentOperationResult => {
      const revision = demoTree(documents).revision;

      return {
        operationId,
        revision,
        documents: planned.affectedPaths.map((path) => {
          const type = documents.registry.find((entry) => entry.path === path)?.type;

          return {
            id: documentIdOf(documents, path),
            path,
            revision: documents.files.get(path)!.revision,
            ...(type !== undefined ? { type } : {}),
          };
        }),
        removedDocumentIds: planned.removedDocumentIds,
        folders: allFolders(documents),
        commit: commitOf(operationId, revision),
      };
    };

  return {
    directoryOf,
    directory,
    /**
     * Validates a Create's documents and builds the directory it produces (Engine scaffold). Pure;
     * the specs module calls it to validate before committing and again to commit.
     */
    scaffold: (input: DemoScaffoldInput) => scaffoldDocuments(state.archetypes, input),
    /** All file paths of a specification as seen by a session context snapshot. */
    pathsFor: (specId: string, record: DemoSpecification) => {
      const documents = directoryOf(specId, record);

      return documents ? pathsOf(documents) : [];
    },
    save(
      subject: string,
      specId: string,
      documentId: string,
      input: SaveInput,
      find: Find,
    ): Promise<SaveResult> {
      return write(
        subject,
        specId,
        find,
        { name: 'save:' + documentId, operationId: input.operationId, input },
        (documents) => planSave(documents, documentId, input),
        (documents, planned) => {
          const path = planned.affectedPaths[0]!;
          const revision = documents.files.get(path)!.revision;
          const type = documents.registry.find((entry) => entry.path === path)?.type;

          return {
            operationId: input.operationId,
            document: {
              id: documentIdOf(documents, path),
              path,
              revision,
              ...(type !== undefined ? { type } : {}),
            },
            commit: commitOf(input.operationId, revision),
          };
        },
      );
    },
    create(subject: string, specId: string, input: CreateDocumentsInput, find: Find) {
      return write(
        subject,
        specId,
        find,
        { name: 'documents', operationId: input.operationId, input },
        (documents) => planCreate(documents, state.archetypes, input),
        operationResult(input.operationId),
      );
    },
    createFolder(subject: string, specId: string, input: DemoFolderInput, find: Find) {
      return write(
        subject,
        specId,
        find,
        { name: 'folders', operationId: input.operationId, input },
        (documents) =>
          planCreate(documents, state.archetypes, { documents: [], folders: [input.path] }),
        operationResult(input.operationId),
      );
    },
    operate(subject: string, specId: string, input: DocumentOperationInput, find: Find) {
      return write(
        subject,
        specId,
        find,
        { name: 'document-operations', operationId: input.operationId, input },
        (documents) => planOperation(documents, state.archetypes, input),
        operationResult(input.operationId),
      );
    },
    /**
     * The workspace `documents` section, like the project Runtime's: the registered documents whose
     * file exists (unclassified files and dangling entries are shown by the document tree only).
     */
    async contribution(specId: string, find: Find) {
      const documents = await directory(specId, find);
      if (!documents) {
        return { state: 'unavailable' as const, reason: 'source_unavailable' as const };
      }

      return {
        state: 'available' as const,
        data: {
          folders: allFolders(documents),
          items: documents.registry.flatMap((entry) => {
            const file = documents.files.get(entry.path);
            if (!file) {
              return [];
            }

            const text = /\.(md|markdown)$/iu.test(entry.path) ? decodeText(file.bytes) : undefined;

            return [
              {
                id: entry.id,
                title: deriveDocumentTitle(entry.path, text),
                filename: entry.path,
                revision: file.revision,
                kind: entry.type,
              },
            ];
          }),
        },
      };
    },
  };
}

export type DemoDocuments = ReturnType<typeof createDemoDocuments>;
