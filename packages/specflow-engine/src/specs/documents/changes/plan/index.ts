import { planCreate, planFolder } from './create';
import type { PlanResult } from './draft';
import type { DocumentChangeRequest } from './request';
import { planSave, planSaveAll } from './save';
import type { PlanningOptions, PlanningSnapshot } from './snapshot';
import { planStructural } from './structural';

export * from './codec';
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
