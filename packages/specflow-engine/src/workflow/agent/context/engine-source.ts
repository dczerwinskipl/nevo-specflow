import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, posix, relative, sep } from 'node:path';

import type { SpecFlowEngine } from '../../../application';
import { getProjectCatalogue } from '../../../definitions/process-catalogue';
import { sha256Hex } from '../../../hash';
import { resolveSpecification } from '../../../specs/discovery';
import { deriveDocumentTitle } from '../../../specs/documents/document-title';
import { readRegisteredDocumentSummaries } from '../../../specs/documents/summaries';
import { readTaskDocuments } from '../../../specs/documents/task-document-reader';
import { WorkflowError } from '../../errors';
import { AGENT_CONTEXT_REFERENCE_BYTES_MAX } from '../../limits';
import type { AgentContextSource } from './gather';
import type { ContextDocument, ContextFileFact } from '../../operations/agent-step-context';

const GLOB_CHARACTERS = /[*?[\]{}]/u;

/** The production {@link AgentContextSource}: the Specification's checkout and the project catalogue. */
export function engineAgentContextSource(engine: SpecFlowEngine): AgentContextSource {
  async function located(specId: string) {
    const found = await resolveSpecification(engine, specId);
    if (found.status !== 'available') {
      throw new WorkflowError(
        'WORKFLOW_SUBJECT_NOT_FOUND',
        `The Specification "${specId}" is not available in a registered checkout (${found.status}).`,
      );
    }

    return found;
  }

  /** The workspace-relative folder of the Specification (the registered paths are below it). */
  async function specificationFolder(specId: string) {
    const found = await located(specId);

    return {
      workspaceRoot: found.workspaceRoot,
      folder: posix.join('specs', found.specification.location, found.specification.slug),
      archetype: found.specification.archetype.id,
    };
  }

  async function specificationDocuments(specId: string): Promise<readonly ContextDocument[]> {
    const { folder } = await specificationFolder(specId);

    return (await readRegisteredDocumentSummaries(engine, specId)).map(
      (summary): ContextDocument => ({
        id: summary.id,
        type: summary.type,
        title: summary.title,
        path: posix.join(folder, summary.path),
        revision: summary.revision,
        templateOnly: summary.contentState === 'baseline',
      }),
    );
  }

  async function taskDocuments(
    specId: string,
    taskId: string,
  ): Promise<readonly ContextDocument[]> {
    const { folder } = await specificationFolder(specId);
    const taskFolder = posix.join(folder, 'tasks', taskId);
    const listing = await readTaskDocuments(engine, specId, taskId);

    return listing.documents.flatMap((document): ContextDocument[] =>
      document.classification === 'registered' && document.file && document.type !== undefined
        ? [
            {
              id: document.id,
              type: document.type,
              title: deriveDocumentTitle(document.path, undefined),
              path: posix.join(taskFolder, document.path),
              revision: document.file.revision,
              templateOnly: document.contentState === 'baseline',
            },
          ]
        : [],
    );
  }

  return {
    async documents(subject) {
      const ofSpecification = await specificationDocuments(subject.specId);

      return subject.kind === 'specification'
        ? ofSpecification
        : [...ofSpecification, ...(await taskDocuments(subject.specId, subject.taskId))];
    },
    async catalogue(specId) {
      const { archetype: archetypeId } = await specificationFolder(specId);
      const { catalogue } = await getProjectCatalogue(engine);
      const archetype = catalogue.findArchetype(archetypeId);

      return {
        documentTypes: catalogue.documentTypes.map((type) => ({
          id: type.id,
          title: type.title,
          useWhen: type.useWhen,
          instructions: type.instructions,
          ...(type.defaultFilename !== undefined ? { defaultFilename: type.defaultFilename } : {}),
        })),
        ...(archetype
          ? {
              archetype: {
                id: archetype.id,
                requirements: archetype.requirements.map(({ documentType, minCount }) => ({
                  documentType,
                  minCount,
                })),
                templates: archetype.templates.map((template) => ({
                  id: template.id,
                  documentType: template.documentType,
                  filename: template.filename,
                  ...(template.title !== undefined ? { title: template.title } : {}),
                  include: template.include,
                  ...(template.instructions !== undefined
                    ? { instructions: template.instructions }
                    : {}),
                })),
              },
            }
          : {}),
      };
    },
    async documentFile(scope, documentId) {
      const { workspaceRoot } = await specificationFolder(scope.specId);
      const document = (
        scope.kind === 'task'
          ? await taskDocuments(scope.specId, scope.taskId)
          : await specificationDocuments(scope.specId)
      ).find((candidate) => candidate.id === documentId);

      return document ? fileFact(workspaceRoot, document.path) : undefined;
    },
    async checkoutFile(specId, path) {
      if (GLOB_CHARACTERS.test(path)) {
        return undefined;
      }

      return fileFact((await specificationFolder(specId)).workspaceRoot, path);
    },
  };
}

/**
 * A regular file inside the checkout as a reference sees it: its size and, within the byte budget,
 * the digest of its bytes. A folder, a missing file and a path that resolves outside the checkout
 * are not files here.
 */
async function fileFact(root: string, path: string): Promise<ContextFileFact | undefined> {
  const absolute = join(root, ...path.split('/'));
  try {
    const status = await lstat(absolute);
    if (!status.isFile()) {
      return undefined;
    }

    const inside = relative(await realpath(root), await realpath(absolute));
    if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
      return undefined;
    }

    return status.size > AGENT_CONTEXT_REFERENCE_BYTES_MAX
      ? { path, bytes: status.size }
      : { path, bytes: status.size, sha256: sha256Hex(await readFile(absolute)) };
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      ['ENOENT', 'ENOTDIR'].includes(String(error.code))
    ) {
      return undefined;
    }

    throw error;
  }
}
