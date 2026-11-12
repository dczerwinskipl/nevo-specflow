import { documentChangeError } from '../errors';
import { planCreate, planFolder } from './create';
import type { PlanResult } from './draft';
import type { DocumentChangeRequest } from './request';
import { planSave, planSaveAll } from './save';
import type { PlanningOptions, PlanningSnapshot } from './snapshot';
import { planStructural } from './structural';

export * from './codec';
export * from './container';
export type { PlanResult } from './draft';
export * from './model';
export * from './request';
export * from './snapshot';

/**
 * Turns a validated request into a plan: pure, exhaustive over the actions. Everything it refuses is
 * refused before any file or journal exists; the writer re-plans from a fresh snapshot under the
 * control lock and compares.
 */
export function planDocumentChange(
  snapshot: PlanningSnapshot,
  request: DocumentChangeRequest,
  options: PlanningOptions = {},
): PlanResult {
  if (snapshot.container.kind === 'task') {
    assertTaskAction(request);
  }

  switch (request.action) {
    case 'save':
      return planSave(snapshot, request);
    case 'save-all':
      return planSaveAll(snapshot, request);
    case 'create':
      return planCreate(snapshot, request, options);
    case 'folder':
      return planFolder(snapshot, request);
    case 'rename':
    case 'move':
    case 'delete':
    case 'classify':
      return planStructural(snapshot, request, options);
    default: {
      const exhaustive: never = request;

      return exhaustive;
    }
  }
}

/**
 * A Task container has no folders (T5): save, batch save, create of typed documents, and rename or
 * delete of a document. Everything else is refused before any plan exists.
 */
function assertTaskAction(request: DocumentChangeRequest): void {
  switch (request.action) {
    case 'save':
    case 'save-all':
      return;
    case 'create':
      if (request.folders.length > 0) {
        throw documentChangeError('operation-invalid', 'A Task has no folders.');
      }

      if (request.documents.some((entry) => entry.type === undefined)) {
        throw documentChangeError('type-invalid', 'A Task document needs a document type.');
      }

      return;
    case 'rename':
    case 'delete':
      if (request.target.kind !== 'document') {
        throw documentChangeError('operation-invalid', 'A Task has no folders.');
      }

      return;
    case 'folder':
    case 'move':
      throw documentChangeError('operation-invalid', 'A Task has no folders.');
    case 'classify':
      throw documentChangeError(
        'operation-invalid',
        'A Task document is registered when it is created.',
      );
    default: {
      const exhaustive: never = request;

      return exhaustive;
    }
  }
}
