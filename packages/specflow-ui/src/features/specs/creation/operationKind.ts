import { message } from '../../../i18n/message';
import type { OperationKindPresentation } from '../../../shared/operations';
import { createOperationEventsUrl } from './api.project';
import { createStepTitle } from './createProgress';

/** Route of the Create list of a project Runtime (served by the Specifications feature). */
export const projectCreateOperationsUrl = '/api/specs/operations';

/** The demo Runtime mirrors the same list contract under its own namespace. */
export const demoCreateOperationsUrl = '/api/demo/specifications/operations';

/**
 * The list of Create operations for the Runtime's data mode; undefined while the mode is unknown,
 * so nothing is read before the flow is known.
 */
export function createOperationsListUrl(
  mode: 'loading' | 'project' | 'demo' | 'unavailable',
): string | undefined {
  if (mode === 'project') return projectCreateOperationsUrl;
  if (mode === 'demo') return demoCreateOperationsUrl;
  return undefined;
}

/** Page where a Create operation is watched and its outcome shown. */
export const createOperationPageHref = (operationId: string) =>
  `/specs/new/creating/${encodeURIComponent(operationId)}`;

/**
 * How the generic operations panel presents `specification-create` rows: the kind label, the titles
 * of the public steps (the same mapping the progress page uses) and the links of one operation.
 */
export const createOperationKind: OperationKindPresentation = {
  kind: 'specification-create',
  label: message('create.operations.kind'),
  stepTitle: createStepTitle,
  detailHref: (row) => createOperationPageHref(row.operationId),
  eventsUrl: (row) => createOperationEventsUrl(row.operationId),
};
