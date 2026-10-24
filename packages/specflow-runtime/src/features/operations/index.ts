/**
 * Shared Runtime module for long-running operation progress and the operation list (consumed by
 * product features such as Specs Create; it has no product capability of its own, hence no
 * `feature.ts`). Only what a consumer imports is exported.
 */
export { registerOperationEventsRoute, type OperationEventsStreamOptions } from './events-route';
export {
  registerOperationListRoute,
  parseOperationListQuery,
  OperationListQueryStringSchema,
  operationListEtag,
  OPERATION_LIST_QUERY_INVALID_CODE,
} from './list-route';
export {
  deriveOperationStatus,
  shapeOperationList,
  type OperationListConfig,
  type ShapeOperationListInput,
} from './list-service';
export type { OperationListSource, OperationSourceRow } from './operation-source';
export {
  createOperationProgressRegistry,
  type OperationProgressListing,
  type OperationProgressRegistry,
  type StoredProgressEvent,
} from './progress-registry';
