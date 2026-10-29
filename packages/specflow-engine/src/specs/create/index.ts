// Create capability boundary: the only entry other capabilities and the package
// surfaces (index, testing, diagnostics) use for Specification creation.
export {
  CreateOperationError,
  CREATE_JOURNAL_RELATIVE_DIR,
  type CreateJournal,
  type CreateStage,
} from './journal';
export { normalizeCreateClientIntent } from './intent';
export { resolveCreateArchetype, type ResolvedCreateArchetype } from './admission';
export {
  createSpecification,
  inspectCreateSpecification,
  type CreateStageObservation,
  type CreateStageObserver,
  type CreateSpecificationInput,
  type CreateSpecificationOptions,
  type CreateSpecificationTarget,
  type CreatedSpecification,
} from './durable';
export {
  createSpecificationFromRequest,
  resumeInterruptedCreateOperation,
  type ResumeCreateOptions,
  type CreateSpecificationRequest,
  type CreateSpecificationRequestOptions,
} from './request';
export {
  createSpecificationForTesting,
  createSpecificationFromRequestForTesting,
  type TestCreateOptions,
} from './test-support';
export { inspectPublicCreateOperation, type PublicCreateInspection } from './inspect/inspection';
export {
  listPublicCreateOperations,
  readPublicCreateOperationRow,
  type PublicCreateListingRow,
  type PublicCreateListingState,
} from './inspect/listing';
export { createStepForStage, type PublicCreateStepId } from './inspect/step-mapping';
export {
  inspectCreateOptions,
  willCommitCreatedScaffold,
  type InspectCreateOptionsOptions,
  type PublicCreateOptions,
  type CreateWorkspaceOption,
  type CreateBaseRefOption,
} from './inspect/options';
