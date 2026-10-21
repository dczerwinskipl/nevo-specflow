import type { DemoDocumentOperationInput, DemoDocumentTree } from '@nevo/specflow-contracts/demo';
import { DemoOperationError, type CreatedDemoSpecification } from '../../../demo/state';
import { validatePath } from './addition';

const within = (path: string, folder: string) =>
  path.toLowerCase() === folder.toLowerCase() ||
  path.toLowerCase().startsWith(folder.toLowerCase() + '/');
const equalPath = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const parent = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const invalid = () => {
  throw new DemoOperationError(400, 'demo_invalid_selection');
};
const actions = (reason?: string) => ({
  rename: { available: !reason, ...(reason ? { reason } : {}) },
  move: { available: !reason, ...(reason ? { reason } : {}) },
  delete: { available: !reason, ...(reason ? { reason } : {}) },
});
export function documentTree(spec: CreatedDemoSpecification): DemoDocumentTree {
  return {
    revision: spec.treeRevision,
    folders: ['', ...spec.folders].map((path) => ({
      path,
      actions: actions(
        !path
          ? 'root_protected'
          : spec.requiredPaths.some((required) => within(required, path))
            ? 'required_document_path'
            : undefined,
      ),
    })),
    documents: [...spec.documents.values()].map((document) => ({
      id: document.id,
      path: document.filename!,
      required: !!document.required,
      revision: document.revision,
      actions: actions(document.required ? 'required_document_path' : undefined),
    })),
    capabilities: {
      createFile: { available: true },
      createFolder: { available: true },
      import: { available: true },
      formats: ['md', 'txt'],
    },
  };
}

/** Computes and validates the complete replacement before any collection is mutated. */
export function planDocumentOperation(
  spec: CreatedDemoSpecification,
  input: DemoDocumentOperationInput,
) {
  if (
    (input.kind === 'folder' && input.documentId !== undefined) ||
    (input.kind === 'document' && input.path !== undefined)
  )
    invalid();
  const document =
    input.kind === 'document' ? spec.documents.get(input.documentId ?? '') : undefined;
  const path = input.kind === 'document' ? document?.filename : input.path;
  if (path === undefined || !path) invalid();
  if (input.kind === 'document' ? !document : !spec.folders.includes(path!))
    throw new DemoOperationError(404, 'specification_document_not_found');
  if ((document?.revision ?? spec.treeRevision) !== input.expectedRevision)
    throw new DemoOperationError(409, 'demo_document_revision_conflict');
  if (spec.requiredPaths.some((required) => within(required, path!)))
    throw new DemoOperationError(409, 'demo_document_required');
  if (
    (input.action === 'rename' &&
      (!input.name || input.name.includes('/') || input.targetFolder !== undefined)) ||
    (input.action === 'move' && (input.targetFolder === undefined || input.name !== undefined)) ||
    (input.action === 'delete' && (input.name !== undefined || input.targetFolder !== undefined))
  )
    invalid();
  if (input.action === 'move' && input.targetFolder && !spec.folders.includes(input.targetFolder))
    invalid();
  const destination =
    input.action === 'rename'
      ? [parent(path!), input.name!].filter(Boolean).join('/')
      : [input.targetFolder!, path!.split('/').at(-1)!].filter(Boolean).join('/');
  if (input.action !== 'delete') {
    try {
      validatePath(destination, input.kind === 'document');
    } catch {
      invalid();
    }
    if (input.kind === 'folder' && within(destination.toLowerCase(), path!.toLowerCase()))
      invalid();
  }
  const affected = (candidate: string) =>
    input.kind === 'document' ? candidate === path : within(candidate, path!);
  const remap = (candidate: string) =>
    affected(candidate) ? destination + candidate.slice(path!.length) : candidate;
  const documents = new Map(spec.documents);
  const removedDocumentIds: string[] = [];
  for (const [id, current] of documents)
    if (affected(current.filename!)) {
      if (input.action === 'delete') {
        documents.delete(id);
        removedDocumentIds.push(id);
      } else {
        const filename = remap(current.filename!);
        documents.set(id, {
          ...current,
          filename,
          title: filename.split('/').at(-1)!,
          revision: current.revision + '-next',
        });
      }
    }
  const folders = spec.folders
    .filter((folder) => input.action !== 'delete' || !affected(folder))
    .map((folder) => (input.action === 'delete' ? folder : remap(folder)));
  const paths = [...folders, ...[...documents.values()].map((item) => item.filename!)];
  if (new Set(paths.map((item) => item.toLowerCase())).size !== paths.length)
    throw new DemoOperationError(409, 'demo_document_path_conflict');
  for (const folder of folders) {
    try {
      validatePath(folder, false);
    } catch {
      invalid();
    }
  }
  const filenames = [...documents.values()].map((item) => item.filename!);
  for (const file of filenames) {
    try {
      validatePath(file, true);
    } catch {
      invalid();
    }
    if (
      paths.some(
        (other) =>
          !equalPath(other, file) && other.toLowerCase().startsWith(file.toLowerCase() + '/'),
      )
    )
      throw new DemoOperationError(409, 'demo_document_path_conflict');
  }
  return { documents, folders, removedDocumentIds };
}
