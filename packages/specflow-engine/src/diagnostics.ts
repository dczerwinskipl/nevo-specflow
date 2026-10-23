/**
 * Explicit local operator diagnostics only. A durable journal is an internal
 * state/recovery authority; never return it from ordinary CLI JSON or HTTP.
 */
export { inspectCloseOperation as inspectCloseOperationDiagnostic } from './specs/lifecycle/reservation';
export { inspectCreateSpecification as inspectCreateSpecificationDiagnostic } from './specs/create';
export type { CloseJournal, ClosePlan } from './specs/lifecycle/model';
export type { CreateJournal } from './specs/create';
