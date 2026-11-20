/**
 * The admission of a workflow write against the project's writer claims (F05): refuses with
 * `SpecificationBusyError` (`WORKFLOW_SPECIFICATION_BUSY`, naming the holder) while a claim other
 * than the caller's own holds the project, with Git on or off. Called inside `serialize` (the
 * project control lock in production), so no claim is admitted between the check and the write.
 * The execution store applies it to every change (`state/claim-guard.ts`), the archetype edit to
 * its own write.
 */
export interface WorkflowWriteAdmission {
  admitWrite(): Promise<void>;
}

/** A host without writer claims (the in-memory workflow, unit tests): every write is admitted. */
export const NO_CLAIMS: WorkflowWriteAdmission = { admitWrite: () => Promise.resolve() };
