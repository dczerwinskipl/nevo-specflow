import { posix } from 'node:path';

import type { SpecFlowEngine } from '../../../application';
import { getProjectCatalogue } from '../../../definitions/process-catalogue';
import { sha256Hex } from '../../../hash';
import { canonicalJson } from '../../../specs/definitions/resolved-catalogue';
import { resolveSpecification } from '../../../specs/discovery';
import { deriveDocumentTitle } from '../../../specs/documents/document-title';
import { readRegisteredDocumentSummaries } from '../../../specs/documents/summaries';
import { readTaskDocuments } from '../../../specs/documents/task-document-reader';
import { WorkflowError } from '../../errors';
import { checkoutFilesOf } from '../../checkout-paths';
import { AGENT_CONTEXT_DOCUMENTS_MAX, AGENT_CONTEXT_FOLDER_FILES_MAX } from '../../limits';
import type { ContextDocument } from '../../operations/agent-step-context';
import { engineNamespacesOf } from '../boundary/engine-facts';
import { fileFact, isCheckoutRelative, isEngineStatePath } from './file-fact';
import type { AgentContextSource } from './gather';
import { SPECIFICATION_ROOT } from '../../../specs/repository';

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
      folder: posix.join(
        SPECIFICATION_ROOT,
        found.specification.location,
        found.specification.slug,
      ),
      archetype: found.specification.archetype.id,
      documentCount: found.specification.documents.length,
    };
  }

  async function specificationDocuments(specId: string): Promise<readonly ContextDocument[]> {
    const { folder, documentCount } = await specificationFolder(specId);
    if (documentCount > AGENT_CONTEXT_DOCUMENTS_MAX) {
      throw new WorkflowError(
        'WORKFLOW_INPUT_INVALID',
        `The agent context is over its budget: ${String(documentCount)} registered documents (at most ${String(AGENT_CONTEXT_DOCUMENTS_MAX)} documents).`,
      );
    }

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
    async documentFile(scope, documentId, budget) {
      const { workspaceRoot } = await specificationFolder(scope.specId);
      const document = (
        scope.kind === 'task'
          ? await taskDocuments(scope.specId, scope.taskId)
          : await specificationDocuments(scope.specId)
      ).find((candidate) => candidate.id === documentId);

      return document ? fileFact(workspaceRoot, document.path, budget) : undefined;
    },
    async checkoutFile(specId, path, budget) {
      if (!isCheckoutRelative(path)) {
        return undefined;
      }

      const { workspaceRoot } = await specificationFolder(specId);
      const single = GLOB_CHARACTERS.test(path)
        ? undefined
        : await fileFact(workspaceRoot, path, budget);
      if (single) {
        return single;
      }

      const listed = await checkoutFilesOf(workspaceRoot, path);
      if (!listed) {
        return undefined;
      }

      const namespaces = engineNamespacesOf(engine, workspaceRoot);
      const files = listed.filter((file) => !isEngineStatePath(file, namespaces));

      if (files.length > AGENT_CONTEXT_FOLDER_FILES_MAX) {
        throw new WorkflowError(
          'WORKFLOW_INPUT_INVALID',
          `The agent context is over its budget: "${path}" names ${String(files.length)} files (at most ${String(AGENT_CONTEXT_FOLDER_FILES_MAX)} files).`,
        );
      }

      const hashed: { path: string; sha256: string }[] = [];
      let bytes = 0;
      for (const file of files) {
        const fact = await fileFact(workspaceRoot, file, budget);
        if (!fact) {
          continue;
        }

        if (fact.sha256 === undefined) {
          return { bytes: fact.bytes, files: files.length };
        }

        hashed.push({ path: file, sha256: fact.sha256 });
        bytes += fact.bytes;
      }

      return { bytes, files: hashed.length, sha256: sha256Hex(canonicalJson(hashed)) };
    },
  };
}
